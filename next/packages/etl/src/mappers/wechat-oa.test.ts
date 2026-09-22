import { describe, expect, it } from 'vitest';
import {
  mapWechatOa,
  sceneOf,
  type LegacyQrcode,
  type LegacyQrcodeRecord,
  type LegacyWechatKey,
  type LegacyWechatMedium,
  type LegacyWechatReply,
} from './wechat-oa';

/**
 * The Official Account migration, on rows copied out of the legacy dump.
 *
 * The rows below keep the legacy spellings exactly — `keys` for the keyword,
 * `temporary` for a flag whose comment contradicts its name, a ticket that
 * lives in a different table from the code it belongs to. Tidying them in the
 * fixtures would be tidying away the thing under test.
 */

const NOW = new Date('2026-09-22T00:00:00.000Z');

// 2024-01-01T00:00:00Z and a fortnight later, as unix seconds.
const JAN = 1_704_067_200;
const LATER = 1_705_276_800;

function reply(over: Partial<LegacyWechatReply> = {}): LegacyWechatReply {
  return { id: 1, type: 'text', data: '{"content":"你好"}', status: 1, hide: 0, ...over };
}

function key(over: Partial<LegacyWechatKey> = {}): LegacyWechatKey {
  return { id: 1, reply_id: 1, keys: '你好', key_type: 0, ...over };
}

function qrcode(over: Partial<LegacyQrcode> = {}): LegacyQrcode {
  return {
    id: 7,
    name: '朝阳门店海报',
    image: 'https://legacy.example.com/qr/7.jpg',
    cate_id: 1,
    type: '',
    content: null,
    data: null,
    follow: 12,
    scan: 30,
    add_time: JAN,
    continue_time: 0,
    end_time: 0,
    status: 1,
    is_del: 0,
    ...over,
  };
}

function record(over: Partial<LegacyQrcodeRecord> = {}): LegacyQrcodeRecord {
  return { id: 1, qid: 7, uid: 100, is_follow: 1, add_time: JAN, ...over };
}

function medium(over: Partial<LegacyWechatMedium> = {}): LegacyWechatMedium {
  return {
    id: 1,
    type: 'image',
    path: '/uploads/1.png',
    media_id: 'MEDIA_0001',
    url: 'https://mmbiz.qpic.cn/1',
    temporary: 0,
    add_time: JAN,
    ...over,
  };
}

const ticket = {
  third_type: 'wechatqrcode',
  third_id: 7,
  ticket: 'TICKET_7',
  url: '',
  expire_seconds: 0,
};

// ---------------------------------------------------------------------------
// the menu
// ---------------------------------------------------------------------------

describe('the menu', () => {
  it('comes out of the cache table as the live menu', () => {
    const buttons = [
      { name: '商城', type: 'view', url: 'https://shop.example.com/' },
      { name: '服务', sub_button: [{ name: '客服', type: 'click', key: 'kefu' }] },
    ];
    const { menus } = mapWechatOa({
      cache: [{ key: 'wechat_menus', result: JSON.stringify(buttons), add_time: JAN }],
    });

    expect(menus).toHaveLength(1);
    // `saveMenu` wrote this row only after WeChat accepted the tree, so what is
    // in it is what the followers are looking at — and its own `add_time` is
    // when they started looking at it.
    expect(menus[0]).toMatchObject({ isActive: true, publishedAt: new Date(JAN * 1000) });
    expect(menus[0]!.buttons).toEqual(buttons);
  });

  it('ignores the other cache keys, and unparsable JSON', () => {
    expect(
      mapWechatOa({ cache: [{ key: 'open_adv', result: '{}', add_time: JAN }] }).menus,
    ).toEqual([]);
    expect(
      mapWechatOa({ cache: [{ key: 'wechat_menus', result: 'not json', add_time: JAN }] }).menus,
    ).toEqual([]);
    expect(
      mapWechatOa({ cache: [{ key: 'wechat_menus', result: '[]', add_time: JAN }] }).menus,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// auto replies
// ---------------------------------------------------------------------------

describe('auto replies', () => {
  it('joins the keyword table and turns the two magic keys into singletons', () => {
    const { autoReplies, report } = mapWechatOa({
      replies: [
        reply({ id: 1, data: '{"content":"欢迎关注"}' }),
        reply({ id: 2, data: '{"content":"没看懂"}' }),
        reply({ id: 3, data: '{"content":"顺丰发货"}' }),
      ],
      keys: [
        key({ id: 1, reply_id: 1, keys: 'subscribe' }),
        key({ id: 2, reply_id: 2, keys: 'default' }),
        key({ id: 3, reply_id: 3, keys: '发货' }),
      ],
    });

    expect(autoReplies.map((row) => row.triggerKind)).toEqual(['subscribe', 'default', 'keyword']);
    expect(autoReplies[0]!.keyword).toBeNull();
    expect(autoReplies[2]).toMatchObject({ keyword: '发货', matchMode: 'exact' });
    expect(report.replies).toBe(3);
  });

  it('turns one reply with several keywords into several rules', () => {
    const { autoReplies } = mapWechatOa({
      replies: [reply({ id: 1, data: '{"content":"顺丰发货"}' })],
      keys: [
        key({ id: 1, reply_id: 1, keys: '发货' }),
        key({ id: 2, reply_id: 1, keys: '物流' }),
        key({ id: 3, reply_id: 1, keys: '快递' }),
      ],
    });

    expect(autoReplies.map((row) => row.keyword)).toEqual(['发货', '物流', '快递']);
    expect(new Set(autoReplies.map((row) => row.payload.text))).toEqual(new Set(['顺丰发货']));
    // Distinct ids: the new schema is one row per rule, and the admin edits them
    // one at a time.
    expect(new Set(autoReplies.map((row) => row.id)).size).toBe(3);
  });

  it('keeps the first rule for a keyword two replies both claim', () => {
    const { autoReplies, report } = mapWechatOa({
      replies: [
        reply({ id: 1, data: '{"content":"第一条"}' }),
        reply({ id: 2, data: '{"content":"第二条"}' }),
      ],
      keys: [key({ id: 1, reply_id: 1, keys: '退货' }), key({ id: 2, reply_id: 2, keys: '退货' })],
    });

    // The legacy matcher took the first row it found too; it just never said so.
    expect(autoReplies).toHaveLength(1);
    expect(autoReplies[0]!.payload.text).toBe('第一条');
    expect(report.repliesDroppedDuplicateKeyword).toBe(1);
    expect(report.droppedKeywords).toEqual(['退货']);
  });

  it('drops a reply nothing can trigger, and the customer-service ones', () => {
    const { autoReplies, report } = mapWechatOa({
      replies: [reply({ id: 1 }), reply({ id: 2 })],
      keys: [key({ id: 1, reply_id: 2, keys: '人工', key_type: 1 })],
    });

    expect(autoReplies).toEqual([]);
    // Reply 1 has no key row at all and could never fire; reply 2's only key is
    // 客服自动回复, which belongs to a different module.
    expect(report.repliesDroppedNoKeyword).toBe(2);
    expect(report.repliesDroppedKefu).toBe(1);
  });

  it('carries a disabled rule across as disabled', () => {
    const { autoReplies } = mapWechatOa({
      replies: [reply({ id: 1, status: 0 })],
      keys: [key()],
    });
    expect(autoReplies[0]!.isEnabled).toBe(false);
  });

  describe('payloads', () => {
    const payloadFor = (type: string, data: string) =>
      mapWechatOa({ replies: [reply({ type, data })], keys: [key()] }).autoReplies[0];

    it('keeps the handle for an image and demotes the local file to a preview', () => {
      // `src` is a path on the old server. It is not a reply — WeChat needs the
      // media id — but it is what the admin list renders, so it survives as `url`.
      expect(payloadFor('image', '{"media_id":"MEDIA_1","src":"/uploads/a.png"}')).toMatchObject({
        replyType: 'image',
        payload: { mediaId: 'MEDIA_1', url: '/uploads/a.png' },
      });
    });

    it('reads a news article whether or not it is nested under `list`', () => {
      const flat = payloadFor(
        'news',
        '{"title":"双十一","synopsis":"活动","url":"https://shop.example.com/a","image":"https://img/1"}',
      );
      expect(flat!.payload.articles).toEqual([
        {
          title: '双十一',
          description: '活动',
          url: 'https://shop.example.com/a',
          picUrl: 'https://img/1',
        },
      ]);

      const nested = payloadFor('news', '{"list":[{"title":"嵌套","url":"https://x/1"}]}');
      expect(nested!.payload.articles?.[0]).toMatchObject({ title: '嵌套', url: 'https://x/1' });
    });

    it('turns the legacy `url` reply into a one-article 图文', () => {
      // `url` was a link the old code rendered as a single-article news message.
      // There is no `url` reply type in the new schema because there never was
      // one in WeChat's.
      const row = payloadFor('url', '{"content":"https://shop.example.com/promo"}');
      expect(row!.replyType).toBe('news');
      expect(row!.payload.articles?.[0]).toMatchObject({
        title: 'https://shop.example.com/promo',
        url: 'https://shop.example.com/promo',
      });
    });

    it('survives a row whose JSON never parsed', () => {
      expect(payloadFor('text', '{oops')!.payload).toEqual({ text: '' });
    });

    it('drops a reply type that has no equivalent', () => {
      const { report } = mapWechatOa({
        replies: [reply({ type: 'music' })],
        keys: [key()],
      });
      expect(report.repliesDroppedUnknownType).toBe(1);
    });
  });
});

// ---------------------------------------------------------------------------
// channel codes
// ---------------------------------------------------------------------------

describe('channel QR codes', () => {
  it('keeps the legacy id as the scene string', () => {
    const { qrcodes } = mapWechatOa({ qrcodes: [qrcode()], qrcodeTickets: [ticket] });
    // The legacy code called `forever($id)`, so every poster already printed
    // carries this number and WeChat echoes it back on every scan. Renaming it
    // would send those scans into no channel at all.
    expect(qrcodes[0]!.scene).toBe('7');
    expect(sceneOf(7)).toBe('7');
    expect(qrcodes[0]!.ticket).toBe('TICKET_7');
  });

  it('drops a code that was never generated at WeChat', () => {
    const { qrcodes, report } = mapWechatOa({ qrcodes: [qrcode()], qrcodeTickets: [] });
    // No ticket row means no poster: there is nothing to attribute scans to.
    expect(qrcodes).toEqual([]);
    expect(report.qrcodesDroppedNoTicket).toBe(1);
  });

  it('keeps counters, expiry and status', () => {
    const { qrcodes } = mapWechatOa({
      qrcodes: [qrcode({ scan: 30, follow: 12, end_time: LATER, status: 0 })],
      qrcodeTickets: [ticket],
    });
    expect(qrcodes[0]).toMatchObject({
      scanCount: 30,
      followCount: 12,
      status: 'disabled',
      expiresAt: new Date(LATER * 1000),
    });
  });

  it('imports a deleted code as soft-deleted rather than dropping it', () => {
    const { qrcodes } = mapWechatOa({
      qrcodes: [qrcode({ is_del: 1 })],
      qrcodeTickets: [ticket],
    });
    // Its scans are real history and its scene must stay claimed for ever: a
    // poster on a wall outlives the row somebody deleted.
    expect(qrcodes[0]!.deletedAt).toEqual(new Date(JAN * 1000));
  });

  it('files a code under a category that exists and no other', () => {
    const categories = [{ id: 1, cate_name: '线下门店', add_time: JAN, is_del: 0 }];
    const { qrcodes } = mapWechatOa({
      qrcodeCategories: categories,
      qrcodes: [qrcode({ cate_id: 1 }), qrcode({ id: 8, cate_id: 99 })],
      qrcodeTickets: [ticket, { ...ticket, third_id: 8, ticket: 'TICKET_8' }],
    });
    expect(qrcodes[0]!.categoryId).toBe(1);
    expect(qrcodes[1]!.categoryId).toBeNull();
  });

  it('keeps a deleted category so its codes keep their filing', () => {
    const { qrcodeCategories, qrcodes } = mapWechatOa({
      qrcodeCategories: [{ id: 1, cate_name: '旧活动', add_time: JAN, is_del: 1 }],
      qrcodes: [qrcode({ cate_id: 1 })],
      qrcodeTickets: [ticket],
    });
    expect(qrcodeCategories[0]!.deletedAt).toEqual(new Date(JAN * 1000));
    expect(qrcodes[0]!.categoryId).toBe(1);
  });

  it('carries the code’s own reply across', () => {
    const { qrcodes } = mapWechatOa({
      qrcodes: [qrcode({ type: 'text', data: '{"content":"扫码有礼"}' })],
      qrcodeTickets: [ticket],
    });
    expect(qrcodes[0]).toMatchObject({ replyType: 'text', replyPayload: { text: '扫码有礼' } });
  });
});

// ---------------------------------------------------------------------------
// scans
// ---------------------------------------------------------------------------

describe('scan history', () => {
  it('keeps the row and drops the link when the account is gone', () => {
    const { qrcodeScans } = mapWechatOa({
      qrcodes: [qrcode()],
      qrcodeTickets: [ticket],
      qrcodeRecords: [record({ id: 1, uid: 100 }), record({ id: 2, uid: 999 })],
      keptUserIds: new Set([100]),
    });

    // The count is what a channel report is about, and a deleted account still
    // scanned the poster.
    expect(qrcodeScans).toHaveLength(2);
    expect(qrcodeScans[0]!.userId).toBe(100);
    expect(qrcodeScans[1]!.userId).toBeNull();
  });

  it('leaves openid null, because that column belongs to E1’s mapping', () => {
    const { qrcodeScans } = mapWechatOa({
      qrcodes: [qrcode()],
      qrcodeTickets: [ticket],
      qrcodeRecords: [record()],
    });
    expect(qrcodeScans[0]!.openid).toBeNull();
    expect(qrcodeScans[0]!.isNewFollower).toBe(true);
  });

  it('drops a scan of a code that did not survive', () => {
    const { qrcodeScans, report } = mapWechatOa({
      qrcodes: [],
      qrcodeRecords: [record({ qid: 7 })],
    });
    expect(qrcodeScans).toEqual([]);
    expect(report.scansDroppedUnknownQrcode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// material
// ---------------------------------------------------------------------------

describe('the material library', () => {
  it('keeps a permanent handle and leaves the attachment unlinked', () => {
    const { media } = mapWechatOa({ media: [medium()], now: NOW });
    expect(media[0]).toMatchObject({
      kind: 'image',
      mediaId: 'MEDIA_0001',
      isPermanent: true,
      expiresAt: null,
      // The legacy `path` is a file on the old server, not a row in the new
      // media library. Inventing an attachment id would point at someone else's
      // file.
      attachmentId: null,
    });
  });

  it('drops a temporary handle that WeChat has already deleted', () => {
    const { media, report } = mapWechatOa({
      media: [medium({ id: 2, temporary: 1, add_time: JAN })],
      now: NOW,
    });
    // Three days after upload the id fails with `40007 invalid media_id` and
    // nothing on screen explains why.
    expect(media).toEqual([]);
    expect(report.mediaDroppedExpired).toBe(1);
  });

  it('keeps a temporary handle that is still alive, with its expiry', () => {
    const uploadedYesterday = Math.floor(NOW.getTime() / 1000) - 24 * 3600;
    const { media } = mapWechatOa({
      media: [medium({ id: 3, temporary: 1, add_time: uploadedYesterday })],
      now: NOW,
    });
    expect(media[0]!.isPermanent).toBe(false);
    expect(media[0]!.expiresAt).toEqual(new Date((uploadedYesterday + 3 * 24 * 3600) * 1000));
  });

  it('skips a row with no handle at all', () => {
    expect(mapWechatOa({ media: [medium({ media_id: '' })], now: NOW }).media).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// the whole thing
// ---------------------------------------------------------------------------

describe('mapWechatOa', () => {
  it('reports every count, and reads nothing from eb_wechat_user', () => {
    const { report } = mapWechatOa({
      cache: [
        {
          key: 'wechat_menus',
          result: '[{"name":"商城","type":"view","url":"https://x/"}]',
          add_time: JAN,
        },
      ],
      replies: [reply()],
      keys: [key()],
      qrcodeCategories: [{ id: 1, cate_name: '线下门店', add_time: JAN, is_del: 0 }],
      qrcodes: [qrcode()],
      qrcodeTickets: [ticket],
      qrcodeRecords: [record()],
      media: [medium()],
      now: NOW,
    });

    expect(report).toMatchObject({
      menus: 1,
      replies: 1,
      categories: 1,
      qrcodes: 1,
      scans: 1,
      media: 1,
    });
    // `wechat_identities` has no counter here on purpose: E1's `user` mapper
    // owns `eb_wechat_user`, and a second mapping of it would either duplicate
    // every follower or disagree about which account an openid belongs to.
    expect(Object.keys(report)).not.toContain('identities');
  });

  it('is empty for an empty shop rather than throwing', () => {
    const output = mapWechatOa({});
    expect(output.menus).toEqual([]);
    expect(output.autoReplies).toEqual([]);
    expect(output.qrcodes).toEqual([]);
    expect(output.report.replies).toBe(0);
  });
});
