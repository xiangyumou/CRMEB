import type { SitePublicConfig } from '@shop/contracts/system/schemas';

import type { Ctx } from '../kernel/context';
import { siteConfig } from './site.config';
import * as repo from './system.repo';
import { wechatMiniConfig } from './wechat-mini.config';

/**
 * `GET /api/v1/site/config` — the shop's own public settings.
 *
 * Three rules hold this file together.
 *
 * 1. **Every value is read through a typed config group**, never by key, so a
 *    field that moves or is renamed is a type error here rather than a blank
 *    logo in production.
 * 2. **Nothing marked `secret` can reach the response.** Not by review, but
 *    structurally: this file reads `site` and `wechat-mini` — of the latter
 *    exactly `enabled`, `contactType` and `contactPhone`, none of them secret —
 *    and it never sees a payment credential at all, because the payment domain
 *    hands over a boolean (`registerSitePaymentMethod`). `system.int.test.ts`
 *    states it as a property over the registry: every `secret: true` field in
 *    *any* registered group is given a distinctive value and must not appear
 *    anywhere in the serialised payload.
 * 3. **An unconfigured shop is a valid answer.** Every field has a renderable
 *    empty form (`''`, `null`, `false`), because a fresh install has to boot and
 *    the app must not have to tell "not set" from "broken".
 *
 * The payload is cached in Redis for 60 s and dropped whenever one of its
 * source groups is saved (`invalidateSiteConfigCache`, called from
 * `configSave`). A cache that is merely unwell is never fatal: a Redis error is
 * logged at `warn` and the payload is rebuilt.
 */

/**
 * `v2` since the payload gained `auth`: a `v1` payload cached by an older build
 * lacks it and would fail response validation for up to a minute after deploy.
 */
const CACHE_KEY = 'site:config:v2';
const CACHE_SECONDS = 60;

/**
 * A payment method the cashier may offer, and how to tell whether it works.
 *
 * **This is an inversion, and it has to stay one.** `system` is the domain
 * every other one imports — `shipping`, `notification` and `stats` all reach in
 * here — so `system` may import no domain back. An earlier draft of this file
 * read `paymentConfig` directly and closed the cycle
 * `system → payment → notification → system`; under that cycle
 * `notification.effects.ts` ran its top-level `registerEffectHandler` while
 * `notification.service.ts` was still half-initialised, registered the handler
 * under the key `undefined/undefined`, and every notification in the system was
 * retried forever with "no handler". The direction of this edge is load-bearing.
 *
 * So `payment` states its own availability, from `registerPaymentDomain()`, and
 * `system` only ever learns a boolean. The key is `keyof
 * SitePublicConfig['payments']`, so a gateway added to the contract cannot be
 * registered under a name the app does not know.
 */
export type SitePaymentMethod = keyof SitePublicConfig['payments'];

export interface SitePaymentMethodSource {
  /** The config group that decides it; saving that group drops the cache. */
  group: string;
  /** `true` once an operator has finished configuring it. Never a credential. */
  isEnabled: (ctx: Ctx) => Promise<boolean>;
}

const paymentMethods = new Map<SitePaymentMethod, SitePaymentMethodSource>();

export function registerSitePaymentMethod(
  method: SitePaymentMethod,
  source: SitePaymentMethodSource,
): void {
  paymentMethods.set(method, source);
}

/** Test helper. Never call this from app code. */
export function resetSitePaymentMethods(): void {
  paymentMethods.clear();
}

/**
 * A sign-in method the app may offer, and how to tell whether it works.
 *
 * The same inversion as `registerSitePaymentMethod`, for the same reason: the
 * answer depends on the `wechat` group's credentials and on whether an SMS
 * sender is usable, and `sms` and `wechat` both import `system`, so `system`
 * may import neither. Each owner registers a probe; this file only ever learns
 * a boolean.
 *
 * `groups` rather than one `group`: a WeChat login is decided by the
 * operator's 启用 switch (`wechat-oa` / `wechat-mini`, here in `system`) *and*
 * the credentials (`wechat`), and saving either has to drop the cache.
 */
export type SiteAuthMethod = keyof SitePublicConfig['auth'];

export interface SiteAuthMethodSource {
  /** The config groups that decide it; saving any of them drops the cache. */
  groups: readonly string[];
  /** `true` once the method can actually sign a shopper in. Never a credential. */
  isEnabled: (ctx: Ctx) => Promise<boolean>;
}

const authMethods = new Map<SiteAuthMethod, SiteAuthMethodSource>();

export function registerSiteAuthMethod(method: SiteAuthMethod, source: SiteAuthMethodSource): void {
  authMethods.set(method, source);
}

/** Test helper. Never call this from app code. */
export function resetSiteAuthMethods(): void {
  authMethods.clear();
}

/**
 * The groups whose values the payload is built from.
 *
 * Saving any of them drops the cache and moves `version`. A function rather
 * than a constant because the payment part of the list arrives at registration
 * time — computed in one place, so a source cannot be added without its
 * invalidation.
 */
export function siteConfigSourceGroups(): string[] {
  const groups = new Set<string>([siteConfig.group, wechatMiniConfig.group]);
  for (const source of paymentMethods.values()) groups.add(source.group);
  for (const source of authMethods.values()) for (const group of source.groups) groups.add(group);
  return [...groups];
}

/** `''` reads as "not filled in" everywhere in the config groups. */
export function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** `setHeader` is present when the call came through `handle()`, absent in tests and jobs. */
export type SiteReadCtx = Ctx & { setHeader?: (name: string, value: string) => void };

export async function siteConfigGet(ctx: SiteReadCtx): Promise<SitePublicConfig> {
  const hit = await readCache(ctx);
  if (hit !== null) return tagged(ctx, hit);

  const payload = await buildSiteConfig(ctx);

  try {
    await ctx.redis.set(CACHE_KEY, JSON.stringify(payload), 'EX', CACHE_SECONDS);
  } catch (error) {
    ctx.logger.warn({ err: error, key: CACHE_KEY }, 'site: config cache write failed');
  }
  return tagged(ctx, payload);
}

/**
 * A weak validator on `version`: the body is semantically the same settings,
 * but the JSON is regenerated per request, so a byte comparison would be wrong.
 * Same treatment the DIY reads get, so the app polls both the same way.
 */
function tagged(ctx: SiteReadCtx, payload: SitePublicConfig): SitePublicConfig {
  ctx.setHeader?.('ETag', `W/"${payload.version}"`);
  ctx.setHeader?.('Cache-Control', 'no-cache');
  return payload;
}

async function readCache(ctx: Ctx): Promise<SitePublicConfig | null> {
  try {
    const raw = await ctx.redis.get(CACHE_KEY);
    return raw === null ? null : (JSON.parse(raw) as SitePublicConfig);
  } catch (error) {
    ctx.logger.warn({ err: error, key: CACHE_KEY }, 'site: config cache read failed');
    return null;
  }
}

/**
 * Drops the cached payload when a group it is built from is saved.
 *
 * Called from `configSave` rather than wired as a config-service event: the
 * save path is one function in this same domain, and one call there is easier
 * to keep true than a publish/subscribe hop nobody can see from the handler.
 */
export async function invalidateSiteConfigCache(ctx: Ctx, group: string): Promise<void> {
  if (!siteConfigSourceGroups().includes(group)) return;
  try {
    await ctx.redis.del(CACHE_KEY);
  } catch (error) {
    // A stale entry lives at most 60 s; failing the operator's save because
    // Redis hiccuped would be the worse trade.
    ctx.logger.warn({ err: error, key: CACHE_KEY }, 'site: config cache invalidation failed');
  }
}

async function buildSiteConfig(ctx: Ctx): Promise<SitePublicConfig> {
  const [site, mini, version] = await Promise.all([
    ctx.config.get(siteConfig),
    ctx.config.get(wechatMiniConfig),
    versionOf(ctx),
  ]);

  return {
    name: site.siteName,
    logo: {
      main: orNull(site.logo),
      login: orNull(site.loginLogo),
      square: orNull(site.logoSquare),
      favicon: orNull(site.favicon),
    },
    copyright: {
      text: site.copyrightText,
      link: orNull(site.copyrightLink),
      imageUrl: orNull(site.copyrightImage),
    },
    share: {
      title: site.shareTitle,
      synopsis: site.shareSummary,
      image: orNull(site.shareImage),
    },
    filing: {
      icpNumber: site.icpNumber,
      icpUrl: site.icpUrl,
      publicSecurityNumber: site.publicSecurityNumber,
      publicSecurityUrl: site.publicSecurityUrl,
    },
    payments: await paymentsOf(ctx),
    auth: await authOf(ctx),
    support: supportOf(site, mini),
    splashAd: {
      enabled: site.splashEnabled && orNull(site.splashImage) !== null,
      imageUrl: orNull(site.splashImage),
      link: orNull(site.splashLink),
      seconds: site.splashSeconds,
    },
    version,
  };
}

/**
 * Which payment buttons the cashier may show.
 *
 * Every method starts at `false` and only a registered probe can raise it, so a
 * process that never installed the payment domain advertises no gateway rather
 * than a broken one. A probe that throws is a `warn` and a `false`, never a 500:
 * this endpoint is the first request the app makes, and a shop whose merchant
 * credentials are half filled in should still be able to show its logo.
 */
export async function paymentsOf(ctx: Ctx): Promise<SitePublicConfig['payments']> {
  const payments: SitePublicConfig['payments'] = { wechat: false };
  await Promise.all(
    [...paymentMethods].map(async ([method, source]) => {
      try {
        payments[method] = await source.isEnabled(ctx);
      } catch (error) {
        ctx.logger.warn({ err: error, method }, 'site: payment availability probe failed');
      }
    }),
  );
  return payments;
}

/**
 * Which sign-in methods the app may offer.
 *
 * Same discipline as `paymentsOf`: every method starts at `false` and only a
 * registered probe can raise it, and a probe that throws is a `warn` and a
 * `false`. A method advertised when it cannot work is the worse failure — the
 * shopper is sent to a login page whose one button answers
 * `AUTH_WECHAT_NOT_CONFIGURED` — so doubt resolves to "not offered".
 */
export async function authOf(ctx: Ctx): Promise<SitePublicConfig['auth']> {
  const auth: SitePublicConfig['auth'] = { wechatOa: false, wechatMini: false, phone: false };
  await Promise.all(
    [...authMethods].map(async ([method, source]) => {
      try {
        auth[method] = await source.isEnabled(ctx);
      } catch (error) {
        ctx.logger.warn({ err: error, method }, 'site: sign-in method probe failed');
      }
    }),
  );
  return auth;
}

/**
 * The 客服 entry.
 *
 * There is no self-hosted 自建客服 (out of scope), so the choice is the
 * mini-program's own chat window or a phone number — exactly what
 * `wechat-mini.contactType` already stores. A shop with no mini-program still
 * has a 联系电话 on the 站点设置 screen, which is what the H5 build dials, so
 * the site group is the fallback rather than a second setting.
 *
 * `qrcodeUrl` rides alongside `kind` rather than inside it: `kefuIcon` shows
 * the 客服二维码 on H5 whatever the mini-program is configured to do.
 */
export function supportOf(
  site: { contactPhone: string; contactQrcode: string },
  mini: { enabled: boolean; contactType: 'mini-program' | 'phone'; contactPhone: string },
): SitePublicConfig['support'] {
  const phone = orNull(mini.contactPhone) ?? orNull(site.contactPhone);
  const qrcodeUrl = orNull(site.contactQrcode);

  if (mini.enabled && mini.contactType === 'mini-program') {
    return { kind: 'mini-program', phone, qrcodeUrl };
  }
  if (phone !== null) return { kind: 'phone', phone, qrcodeUrl };
  return { kind: 'none', phone: null, qrcodeUrl };
}

/**
 * A string that moves whenever any source group is saved.
 *
 * The newest `config_values.updated_at` across the source groups, as
 * milliseconds — the same discipline as the DIY `version`, and for the same
 * reason: the app polls cheaply and re-downloads only when the string changed.
 * `'0'` for a shop where nothing has ever been saved, which is a real state and
 * must not be mistaken for "unknown, re-fetch every time".
 */
async function versionOf(ctx: Ctx): Promise<string> {
  const stamps = await Promise.all(
    siteConfigSourceGroups().map((group) => repo.configGroupUpdatedAt(ctx.db, group)),
  );
  let newest = 0;
  for (const stamp of stamps) {
    if (stamp && stamp.getTime() > newest) newest = stamp.getTime();
  }
  return String(newest);
}
