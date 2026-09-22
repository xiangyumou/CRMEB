import type { MiniCodeQuery, MiniCodeResult } from '@shop/contracts/wechat/schemas';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { isRejected, resolveStorage, sniffFileType } from '../storage';
import { wechatMiniConfig } from '../system';
import { getWechatClient } from './wechat.client';
import { wechatConfig } from './wechat.config';
import * as repo from './wechat.mini-code.repo';

/**
 * 小程序码 — `wxa/getwxacodeunlimit`, generated once and served from our own
 * storage afterwards.
 *
 * Three properties, in the order they matter:
 *
 *  1. **The pair `(page, scene)` is the cache key**, because WeChat's answer
 *     for a pair never changes. The legacy app asked WeChat on every render of
 *     every poster; a shop with one product on the home screen could spend a
 *     day's quota before lunch and then show broken images to everybody.
 *  2. **The bytes are ours.** The response is stored through the storage
 *     driver and the shopper is handed a URL on the shop's own host. WeChat's
 *     own image URLs expire; a poster generated for a WeChat Moment does not.
 *  3. **A refusal is a refusal, not a stored error.** These endpoints answer
 *     200 with a JSON `errcode` body when they say no, so a client that
 *     assumed a file would cache a 43-byte "invalid page" as a PNG for ever.
 *     `callBytes` tells the two apart and this service turns the second into
 *     `WECHAT_MINI_CODE_FAILED` (502) carrying WeChat's number.
 */

/** WeChat's own limit on `scene`, in bytes. */
export const SCENE_MAX_BYTES = 32;

/** Where the generated PNGs live under the storage root. */
const DIRECTORY = 'wechat-mini-code';

/** A year: the bytes for a pair never change, so the URL is immutable. */
const CACHE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

async function miniConfigured(ctx: Ctx): Promise<boolean> {
  const [mini, core] = await Promise.all([
    ctx.config.get(wechatMiniConfig),
    ctx.config.get(wechatConfig),
  ]);
  return mini.enabled && core.miniAppId.trim() !== '' && core.miniAppSecret.trim() !== '';
}

/**
 * The URL of the code for this page and scene, generating it if nobody has.
 *
 * The scene is re-checked here even though the contract's schema has already
 * refused an over-long one: the limit is WeChat's, in **bytes**, and a domain
 * that trusts its caller to have parsed the input is a domain that breaks the
 * first time somebody calls it from a job.
 */
export async function miniCodeUrl(ctx: Ctx, query: MiniCodeQuery): Promise<MiniCodeResult> {
  const scene = query.scene.trim();
  if (scene === '' || Buffer.byteLength(scene, 'utf8') > SCENE_MAX_BYTES) {
    throw new DomainError('VALIDATION_FAILED', {
      details: [{ field: 'scene', message: `scene 最长 ${SCENE_MAX_BYTES} 字节` }],
    });
  }
  const key = { page: query.page, scene };

  const cached = await repo.findByPageScene(ctx.db, key);
  if (cached) return { url: cached.url };

  if (!(await miniConfigured(ctx))) throw new DomainError('AUTH_WECHAT_NOT_CONFIGURED');

  const result = await getWechatClient(ctx).callBytes('mini', {
    method: 'POST',
    path: '/wxa/getwxacodeunlimit',
    // `check_path: false` — the page is on this system's own allow-list and a
    // shop generating a poster before the version carrying that page is
    // published is a normal Tuesday, not an error worth failing the share on.
    body: { page: key.page, scene, check_path: false, env_version: 'release' },
  });

  if (!result.ok) {
    ctx.logger.warn(
      { page: key.page, errcode: result.errcode, errmsg: result.errmsg },
      '小程序码生成失败',
    );
    throw new DomainError('WECHAT_MINI_CODE_FAILED', {
      details: { errcode: result.errcode, errmsg: result.errmsg },
    });
  }

  // WeChat said it is a file; the bytes say what kind. An image we cannot
  // identify is not going into the storage root under a `.png` name.
  const sniffed = sniffFileType(result.bytes, result.contentType);
  if (isRejected(sniffed) || sniffed.kind !== 'image') {
    ctx.logger.warn({ page: key.page, contentType: result.contentType }, '小程序码返回的不是图片');
    throw new DomainError('WECHAT_MINI_CODE_FAILED', {
      details: { errcode: 0, errmsg: 'not an image' },
    });
  }

  const { storage } = await resolveStorage(ctx);
  const stored = await storage.put(result.bytes, {
    directory: DIRECTORY,
    filename: `code.${sniffed.extension}`,
    contentType: sniffed.mime,
    maxAge: CACHE_MAX_AGE_SEC,
  });

  const written = await repo.insertIgnoringConflict(ctx.db, {
    ...key,
    storageKey: stored.key,
    url: storage.url(stored.key),
  });

  if (!written.inserted && written.row.storageKey !== stored.key) {
    // Somebody else won the race with an identical picture. Ours is an orphan
    // no row points at, and leaving it behind would grow the uploads directory
    // by one file per collision for ever.
    await storage.delete(stored.key).catch((error: unknown) => {
      ctx.logger.warn({ err: error, key: stored.key }, '未能删除重复的小程序码');
    });
  }

  return { url: written.row.url };
}
