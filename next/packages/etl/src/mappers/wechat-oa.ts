/**
 * Legacy Official Account tables → the new `wechat_*` schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy                                     | New                        |
 * | ------------------------------------------ | -------------------------- |
 * | `eb_cache` where `key = 'wechat_menus'`    | `wechat_oa_menus`          |
 * | `eb_wechat_reply` + `eb_wechat_key`        | `wechat_auto_replies`      |
 * | `eb_wechat_qrcode_cate`                    | `wechat_qrcode_categories` |
 * | `eb_wechat_qrcode` + `eb_qrcode`           | `wechat_qrcodes`           |
 * | `eb_wechat_qrcode_record`                  | `wechat_qrcode_scans`      |
 * | `eb_wechat_media`                          | `wechat_media`             |
 *
 * **`eb_wechat_user` is not read here.** E1's `mappers/user.ts` maps it into
 * `wechat_identities` (platform `oa`), and mapping it twice would either
 * duplicate every follower or silently disagree with E1 about which account an
 * openid belongs to.
 *
 * Also deliberately not read:
 *
 * - `eb_wechat_message` — a free-text log of "user did something", keyed by
 *   openid, with no schema and no reader in the new admin. Audit is a different
 *   feature with a different table.
 * - `eb_wechat_news_category` — the legacy 图文 library. A `news` reply now
 *   carries its articles inline, so the library has nothing to be the library
 *   *of*; the articles that are actually referenced come across on the replies
 *   that reference them.
 * - `eb_wechat_key` rows with `key_type = 1` — 客服自动回复, which belongs to
 *   the customer-service module rather than to the Official Account. Counted,
 *   not dropped silently.
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/** `eb_cache`. The menu lives under `key = 'wechat_menus'`; `result` is the button JSON. */
export interface LegacyCacheRow {
  key: string;
  result: string | null;
  add_time: number;
}

/** `eb_wechat_reply`. `data` is JSON whose shape depends on `type`. */
export interface LegacyWechatReply {
  id: number;
  /** `text` / `image` / `news` / `voice`. */
  type: string;
  data: string | null;
  /** 0 = disabled, 1 = enabled. */
  status: number;
  hide: number;
}

/** `eb_wechat_key`. The keyword, including the two magic ones. */
export interface LegacyWechatKey {
  id: number;
  reply_id: number;
  keys: string;
  /** 0 公众号自动回复, 1 客服自动回复. */
  key_type: number;
}

/** `eb_wechat_qrcode_cate`. */
export interface LegacyQrcodeCategory {
  id: number;
  cate_name: string;
  add_time: number;
  is_del: number;
}

/** `eb_wechat_qrcode`. No scene column: the scene *is* the id — see `sceneOf`. */
export interface LegacyQrcode {
  id: number;
  name: string;
  image: string;
  cate_id: number;
  type: string;
  content: string | null;
  data: string | null;
  follow: number;
  scan: number;
  add_time: number;
  /** Validity in seconds; 0 = permanent. */
  continue_time: number;
  end_time: number;
  /** 1 = enabled. */
  status: number;
  is_del: number;
}

/** `eb_qrcode`, filtered to `third_type = 'wechatqrcode'`. This is where the ticket lives. */
export interface LegacyQrcodeTicket {
  /** Present in every real dump; optional so a hand-built test row can leave it out. */
  id?: number;
  third_type: string;
  third_id: number;
  ticket: string;
  url: string;
  expire_seconds: number;
}

/** `eb_wechat_qrcode_record`. */
export interface LegacyQrcodeRecord {
  id: number;
  qid: number;
  uid: number;
  is_follow: number;
  add_time: number;
}

/** `eb_wechat_media`. */
export interface LegacyWechatMedium {
  id: number;
  type: string;
  path: string;
  media_id: string;
  url: string;
  /** 0 永久, 1 临时 — the legacy comment has it backwards from the column name. */
  temporary: number;
  add_time: number;
}

// ---------------------------------------------------------------------------
// output row shapes (written by hand so `@shop/etl` does not depend on `@shop/db`)
// ---------------------------------------------------------------------------

export type ReplyTrigger = 'subscribe' | 'keyword' | 'default';
export type ReplyMatchMode = 'exact' | 'contains';
export type ReplyType = 'text' | 'image' | 'voice' | 'video' | 'news';
export type MediaKind = 'image' | 'voice' | 'video' | 'thumb' | 'news';
export type QrcodeStatus = 'active' | 'disabled';

export interface ReplyPayload {
  text?: string;
  mediaId?: string;
  url?: string;
  title?: string;
  description?: string;
  articles?: { title: string; description: string; url: string; picUrl: string }[];
}

export interface MenuButton {
  name: string;
  type?: string;
  key?: string;
  url?: string;
  appid?: string;
  pagepath?: string;
  media_id?: string;
  sub_button?: MenuButton[];
}

export interface MenuRow {
  name: string;
  buttons: MenuButton[];
  isActive: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AutoReplyRow {
  id: number;
  triggerKind: ReplyTrigger;
  keyword: string | null;
  matchMode: ReplyMatchMode | null;
  replyType: ReplyType;
  payload: ReplyPayload;
  isEnabled: boolean;
  sortOrder: number;
}

export interface QrcodeCategoryRow {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface QrcodeRow {
  id: number;
  categoryId: number | null;
  name: string;
  scene: string;
  ticket: string | null;
  imageUrl: string | null;
  expiresAt: Date | null;
  replyType: ReplyType | null;
  replyPayload: ReplyPayload | null;
  scanCount: number;
  followCount: number;
  status: QrcodeStatus;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface QrcodeScanRow {
  id: number;
  qrcodeId: number;
  userId: number | null;
  openid: null;
  isNewFollower: boolean;
  createdAt: Date;
}

export interface MediumRow {
  id: number;
  kind: MediaKind;
  mediaId: string;
  attachmentId: null;
  url: string | null;
  isPermanent: boolean;
  expiresAt: Date | null;
  createdAt: Date;
}

/** Why a row was not migrated. Every count here is reported, never swallowed. */
export interface WechatOaMigrationReport {
  menus: number;
  replies: number;
  repliesDroppedKefu: number;
  repliesDroppedNoKeyword: number;
  repliesDroppedDuplicateKeyword: number;
  repliesDroppedUnknownType: number;
  categories: number;
  /**
   * Live categories whose name another live category already had.
   * `wechat_qrcode_categories_name_uq` allows one live row per name, so the
   * later one gets its legacy id appended — `双十一（#7）` — rather than
   * failing the group or vanishing with the codes filed under it.
   */
  categoriesRenamedDuplicate: number;
  qrcodes: number;
  qrcodesDroppedNoTicket: number;
  /** Category or code names longer than the new column (64 / 100), cut to fit. */
  namesTruncated: number;
  scans: number;
  scansDroppedUnknownQrcode: number;
  media: number;
  mediaDroppedExpired: number;
  /** Rows with an empty `media_id`: nothing WeChat could ever be sent. */
  mediaDroppedNoHandle: number;
  /**
   * A second row for a `(kind, media_id)` already taken — possible because an
   * unknown legacy `type` folds into `image`. `wechat_media_uq` would refuse it.
   */
  mediaDroppedDuplicate: number;
  /** Keywords that lost a duplicate, so a human can check what was overwritten. */
  droppedKeywords: string[];
}

export interface WechatOaMigrationInput {
  cache?: readonly LegacyCacheRow[];
  replies?: readonly LegacyWechatReply[];
  keys?: readonly LegacyWechatKey[];
  qrcodeCategories?: readonly LegacyQrcodeCategory[];
  qrcodes?: readonly LegacyQrcode[];
  qrcodeTickets?: readonly LegacyQrcodeTicket[];
  qrcodeRecords?: readonly LegacyQrcodeRecord[];
  media?: readonly LegacyWechatMedium[];
  /** Ids that survived the user migration. A scan by a deleted account keeps the count, loses the link. */
  keptUserIds?: ReadonlySet<number>;
  /**
   * When the migration runs. Temporary media expire three days after upload and
   * a handle that has already expired is not worth a row.
   */
  now?: Date;
}

export interface WechatOaMigrationOutput {
  menus: MenuRow[];
  autoReplies: AutoReplyRow[];
  qrcodeCategories: QrcodeCategoryRow[];
  qrcodes: QrcodeRow[];
  qrcodeScans: QrcodeScanRow[];
  media: MediumRow[];
  report: WechatOaMigrationReport;
}

// ---------------------------------------------------------------------------
// mapping
// ---------------------------------------------------------------------------

/** Legacy unix seconds; `0` is the legacy way of saying NULL. */
function instant(seconds: number): Date | null {
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

function parseJson(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    // A legacy row whose JSON never parsed did not render in the old shop
    // either; an empty payload is the honest translation of "nothing was sent".
    return {};
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/**
 * The reply type, with the one legacy value that has no new equivalent folded
 * in: `url` was a link rendered as a one-article 图文, which is what `news` is.
 */
function replyTypeOf(legacy: string): ReplyType | null {
  switch (legacy) {
    case 'text':
      return 'text';
    case 'image':
      return 'image';
    case 'voice':
      return 'voice';
    case 'video':
      return 'video';
    case 'news':
    case 'url':
      return 'news';
    default:
      return null;
  }
}

/**
 * Legacy `data` JSON → the new payload.
 *
 * The shapes are not symmetrical. Text kept its content under `content`; image
 * and voice kept *both* the WeChat handle (`media_id`) and the local file
 * (`src`), and only the handle is a reply — `src` becomes `url`, which the
 * admin list renders as a preview and which is never sent to WeChat. A `news`
 * row is one article spread across four keys, sometimes nested one level under
 * `list`.
 */
function payloadOf(type: ReplyType, raw: string | null): ReplyPayload {
  const data = parseJson(raw);
  const nested = Array.isArray(data['list']) ? (data['list'] as unknown[]) : [];
  const article = nested.length > 0 ? ((nested[0] ?? {}) as Record<string, unknown>) : data;

  switch (type) {
    case 'text':
      return { text: str(data['content']) };
    case 'image':
    case 'voice':
    case 'video': {
      const payload: ReplyPayload = { mediaId: str(data['media_id']) };
      const src = str(data['src']);
      if (src !== '') payload.url = src;
      const title = str(data['title']);
      if (type === 'video' && title !== '') payload.title = title;
      return payload;
    }
    case 'news': {
      const title = str(article['title']) || str(article['content']);
      const url = str(article['url']) || str(article['content']);
      if (title === '' && url === '') return { articles: [] };
      return {
        articles: [
          {
            title,
            description: str(article['synopsis']) || str(article['description']),
            url,
            picUrl: str(article['image']) || str(article['image_input']),
          },
        ],
      };
    }
  }
}

/**
 * The scene string a migrated code must carry.
 *
 * The legacy code called `forever($id)`, so the scene WeChat echoes back on
 * every scan of a poster already printed is the **row id**, as a string. It is
 * not a new `CH_…` scene and it must not be renamed: every poster in every shop
 * window keeps pointing at this number, and changing it would send their scans
 * into no channel at all.
 */
export function sceneOf(legacyId: number): string {
  return String(legacyId);
}

function mediaKindOf(legacy: string): MediaKind {
  switch (legacy) {
    case 'voice':
      return 'voice';
    case 'video':
      return 'video';
    case 'thumb':
      return 'thumb';
    case 'news':
      return 'news';
    default:
      return 'image';
  }
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** A copy in legacy-id order; a row with no id keeps its place relative to the others. */
function byId<T extends { id?: number }>(rows: readonly T[] | undefined): T[] {
  return [...(rows ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export function mapWechatOa(input: WechatOaMigrationInput): WechatOaMigrationOutput {
  const now = input.now ?? new Date();

  // Every rule below that keeps "the first" of something — a keyword, a
  // category name, a media handle, a ticket — and every id assigned in order,
  // depends on the order of the rows. `select *` promises none, so the rows
  // are put in legacy-id order here: the same dump maps the same way twice.
  const menus = mapMenu(input.cache ?? []);
  const replies = mapReplies(byId(input.replies), byId(input.keys));
  const categories = mapCategories(byId(input.qrcodeCategories));
  const codes = mapQrcodes(byId(input.qrcodes), byId(input.qrcodeTickets), categories.keptIds);
  const namesTruncated = categories.truncated + codes.truncated;
  const scans = mapScans(byId(input.qrcodeRecords), codes.keptIds, input.keptUserIds);
  const media = mapMedia(byId(input.media), now);

  return {
    menus,
    autoReplies: replies.rows,
    qrcodeCategories: categories.rows,
    qrcodes: codes.rows,
    qrcodeScans: scans.rows,
    media: media.rows,
    report: {
      menus: menus.length,
      replies: replies.rows.length,
      repliesDroppedKefu: replies.droppedKefu,
      repliesDroppedNoKeyword: replies.droppedNoKeyword,
      repliesDroppedDuplicateKeyword: replies.droppedDuplicate,
      repliesDroppedUnknownType: replies.droppedUnknownType,
      categories: categories.rows.length,
      categoriesRenamedDuplicate: categories.renamedDuplicate,
      qrcodes: codes.rows.length,
      qrcodesDroppedNoTicket: codes.droppedNoTicket,
      namesTruncated,
      scans: scans.rows.length,
      scansDroppedUnknownQrcode: scans.droppedUnknownQrcode,
      media: media.rows.length,
      mediaDroppedExpired: media.droppedExpired,
      mediaDroppedNoHandle: media.droppedNoHandle,
      mediaDroppedDuplicate: media.droppedDuplicate,
      droppedKeywords: replies.droppedKeywords,
    },
  };
}

/**
 * The menu, which the legacy shop kept in a cache table.
 *
 * One row in, one row out, and it is marked live: `eb_cache.wechat_menus` was
 * written only by `saveMenu`, which wrote it *after* WeChat accepted the tree,
 * so what is in there is exactly what the followers are looking at. That is
 * also why `published_at` is the cache row's own `add_time` rather than the
 * migration's clock.
 */
function mapMenu(cache: readonly LegacyCacheRow[]): MenuRow[] {
  const row = cache.find((entry) => entry.key === 'wechat_menus');
  if (!row?.result) return [];

  let buttons: MenuButton[];
  try {
    const parsed: unknown = JSON.parse(row.result);
    buttons = Array.isArray(parsed) ? (parsed as MenuButton[]) : [];
  } catch {
    return [];
  }
  if (buttons.length === 0) return [];

  const at = instant(row.add_time) ?? new Date(0);
  return [
    { name: '公众号菜单', buttons, isActive: true, publishedAt: at, createdAt: at, updatedAt: at },
  ];
}

interface ReplyResult {
  rows: AutoReplyRow[];
  droppedKefu: number;
  droppedNoKeyword: number;
  droppedDuplicate: number;
  droppedUnknownType: number;
  droppedKeywords: string[];
}

/**
 * Replies, joined to the keywords that trigger them.
 *
 * The legacy split is the awkward part: `eb_wechat_reply` holds the content and
 * `eb_wechat_key` holds the trigger, one-to-many, with `subscribe` and
 * `default` sitting in the keyword column as magic strings. A reply with no key
 * row is unreachable — it can never fire — so it is dropped and counted rather
 * than imported as a rule nobody can see the trigger for.
 *
 * A reply with several keywords becomes several rules, which is what the new
 * schema wants and what the admin can then edit one at a time. The new unique
 * index allows one rule per keyword, so a keyword claimed twice in the legacy
 * data keeps its first rule and reports the rest: the old matcher took the
 * first row it found too, it just never told anybody.
 */
function mapReplies(
  replies: readonly LegacyWechatReply[],
  keys: readonly LegacyWechatKey[],
): ReplyResult {
  const rows: AutoReplyRow[] = [];
  const droppedKeywords: string[] = [];
  let droppedKefu = 0;
  let droppedNoKeyword = 0;
  let droppedDuplicate = 0;
  let droppedUnknownType = 0;

  const byReply = new Map<number, LegacyWechatKey[]>();
  for (const key of keys) {
    if (key.key_type === 1) {
      droppedKefu += 1;
      continue;
    }
    const list = byReply.get(key.reply_id);
    if (list) list.push(key);
    else byReply.set(key.reply_id, [key]);
  }

  const takenKeywords = new Set<string>();
  const takenSingletons = new Set<ReplyTrigger>();
  let nextId = 1;

  for (const reply of replies) {
    const type = replyTypeOf(reply.type);
    if (type === null) {
      droppedUnknownType += 1;
      continue;
    }
    const triggers = byReply.get(reply.id) ?? [];
    if (triggers.length === 0) {
      droppedNoKeyword += 1;
      continue;
    }
    const payload = payloadOf(type, reply.data);

    for (const trigger of triggers) {
      const keyword = trigger.keys.trim();
      if (keyword === '') {
        droppedNoKeyword += 1;
        continue;
      }

      if (keyword === 'subscribe' || keyword === 'default') {
        const kind: ReplyTrigger = keyword === 'subscribe' ? 'subscribe' : 'default';
        if (takenSingletons.has(kind)) {
          droppedDuplicate += 1;
          droppedKeywords.push(keyword);
          continue;
        }
        takenSingletons.add(kind);
        rows.push({
          id: nextId++,
          triggerKind: kind,
          keyword: null,
          matchMode: null,
          replyType: type,
          payload,
          isEnabled: reply.status === 1,
          sortOrder: 0,
        });
        continue;
      }

      if (takenKeywords.has(keyword)) {
        droppedDuplicate += 1;
        droppedKeywords.push(keyword);
        continue;
      }
      takenKeywords.add(keyword);
      rows.push({
        id: nextId++,
        triggerKind: 'keyword',
        keyword,
        // The legacy matcher compared the whole message to `keys`. `contains`
        // would fire on messages the old shop never answered, which an operator
        // would read as the migration inventing replies.
        matchMode: 'exact',
        replyType: type,
        payload,
        isEnabled: reply.status === 1,
        sortOrder: 0,
      });
    }
  }

  return {
    rows,
    droppedKefu,
    droppedNoKeyword,
    droppedDuplicate,
    droppedUnknownType,
    droppedKeywords,
  };
}

interface CategoryResult {
  rows: QrcodeCategoryRow[];
  keptIds: Set<number>;
  truncated: number;
  renamedDuplicate: number;
}

/** `value` cut to `max` characters; `cut` says whether it had to be. */
function fitName(value: string, max: number): { value: string; cut: boolean } {
  return value.length <= max ? { value, cut: false } : { value: value.slice(0, max), cut: true };
}

/**
 * Categories keep their legacy ids, including the deleted ones.
 *
 * A deleted category is imported as soft-deleted rather than skipped, because
 * the codes filed under it still point at it: dropping the row would either
 * orphan a foreign key or move somebody's channel report into 未分类.
 */
function mapCategories(categories: readonly LegacyQrcodeCategory[]): CategoryResult {
  const rows: QrcodeCategoryRow[] = [];
  const keptIds = new Set<number>();
  const liveNames = new Set<string>();
  let truncated = 0;
  let renamedDuplicate = 0;

  for (const [index, category] of categories.entries()) {
    const createdAt = instant(category.add_time) ?? new Date(0);
    const fitted = fitName(category.cate_name, 64);
    if (fitted.cut) truncated += 1;
    let name = fitted.value;
    if (category.is_del !== 1) {
      if (liveNames.has(name)) {
        const suffix = `（#${String(category.id)}）`;
        name = `${name.slice(0, 64 - suffix.length)}${suffix}`;
        renamedDuplicate += 1;
      }
      liveNames.add(name);
    }
    rows.push({
      id: category.id,
      name,
      sortOrder: index,
      createdAt,
      deletedAt: category.is_del === 1 ? createdAt : null,
    });
    keptIds.add(category.id);
  }
  return { rows, keptIds, truncated, renamedDuplicate };
}

interface QrcodeResult {
  rows: QrcodeRow[];
  keptIds: Set<number>;
  droppedNoTicket: number;
  truncated: number;
}

/**
 * Channel codes, with the ticket fetched from the other table it lives in.
 *
 * Two legacy quirks matter here. The ticket is not on `eb_wechat_qrcode` at all
 * — it is on `eb_qrcode` under `third_type = 'wechatqrcode'` — and a code with
 * no ticket row was never actually generated at WeChat, so there is no poster
 * and nothing to attribute: it is dropped and counted.
 *
 * Deleted codes are imported as soft-deleted, not skipped. The scans under them
 * are real history, and the scene string must stay claimed for ever so that a
 * poster still on a wall can never be re-attributed to a new code.
 */
function mapQrcodes(
  qrcodes: readonly LegacyQrcode[],
  tickets: readonly LegacyQrcodeTicket[],
  categoryIds: ReadonlySet<number>,
): QrcodeResult {
  const rows: QrcodeRow[] = [];
  const keptIds = new Set<number>();
  let droppedNoTicket = 0;
  let truncated = 0;

  const ticketFor = new Map<number, LegacyQrcodeTicket>();
  for (const ticket of tickets) {
    if (ticket.third_type !== 'wechatqrcode') continue;
    // The first row that carries a ticket wins, so a stale blank row next to a
    // real one never hides it — the same predicate `etl verify` counts by.
    if (ticketFor.get(ticket.third_id)?.ticket) continue;
    ticketFor.set(ticket.third_id, ticket);
  }

  for (const code of qrcodes) {
    const ticket = ticketFor.get(code.id);
    if (!ticket?.ticket) {
      droppedNoTicket += 1;
      continue;
    }
    const createdAt = instant(code.add_time) ?? new Date(0);
    const replyType = replyTypeOf(code.type);
    const name = fitName(code.name, 100);
    if (name.cut) truncated += 1;

    rows.push({
      id: code.id,
      categoryId: categoryIds.has(code.cate_id) ? code.cate_id : null,
      name: name.value,
      scene: sceneOf(code.id),
      ticket: ticket.ticket,
      imageUrl: code.image || ticket.url || null,
      expiresAt: instant(code.end_time),
      replyType,
      replyPayload: replyType === null ? null : payloadOf(replyType, code.data ?? code.content),
      scanCount: Math.max(0, code.scan),
      followCount: Math.max(0, code.follow),
      status: code.status === 1 ? 'active' : 'disabled',
      createdAt,
      deletedAt: code.is_del === 1 ? createdAt : null,
    });
    keptIds.add(code.id);
  }

  return { rows, keptIds, droppedNoTicket, truncated };
}

interface ScanResult {
  rows: QrcodeScanRow[];
  droppedUnknownQrcode: number;
}

/**
 * Scan history.
 *
 * `openid` is null for every migrated row and that is deliberate: the legacy
 * record kept only `uid`, and the openid it would need is E1's to map. The
 * column exists for scans by somebody who has no account yet, which the legacy
 * table could not record at all.
 *
 * A scan by a user who did not survive the user migration keeps the row and
 * loses the link: the count is what the channel report is about, and a deleted
 * account still scanned the poster.
 */
function mapScans(
  records: readonly LegacyQrcodeRecord[],
  qrcodeIds: ReadonlySet<number>,
  keptUserIds: ReadonlySet<number> | undefined,
): ScanResult {
  const rows: QrcodeScanRow[] = [];
  let droppedUnknownQrcode = 0;

  for (const record of records) {
    if (!qrcodeIds.has(record.qid)) {
      droppedUnknownQrcode += 1;
      continue;
    }
    const known = record.uid > 0 && (keptUserIds === undefined || keptUserIds.has(record.uid));
    rows.push({
      id: record.id,
      qrcodeId: record.qid,
      userId: known ? record.uid : null,
      openid: null,
      isNewFollower: record.is_follow === 1,
      createdAt: instant(record.add_time) ?? new Date(0),
    });
  }

  return { rows, droppedUnknownQrcode };
}

interface MediaResult {
  rows: MediumRow[];
  droppedExpired: number;
  droppedNoHandle: number;
  droppedDuplicate: number;
}

/**
 * The material library's handles.
 *
 * `attachment_id` is null for every migrated row: the legacy `path` is a file
 * path, not a row in F1's media library, and inventing an attachment id would
 * point at somebody else's file. The handle and its URL are what the reply
 * engine needs; re-linking the local copy is a job for the admin, one upload at
 * a time, and only if anybody ever wants it.
 *
 * Temporary handles that have already expired are dropped: WeChat deletes them
 * after three days, so the row would be a media id that fails on first use with
 * `40007 invalid media_id` and no way to tell why.
 */
function mapMedia(media: readonly LegacyWechatMedium[], now: Date): MediaResult {
  const rows: MediumRow[] = [];
  let droppedExpired = 0;
  let droppedNoHandle = 0;
  let droppedDuplicate = 0;
  const taken = new Set<string>();

  for (const medium of media) {
    if (medium.media_id.trim() === '') {
      droppedNoHandle += 1;
      continue;
    }
    const createdAt = instant(medium.add_time) ?? new Date(0);
    const isPermanent = medium.temporary === 0;
    const expiresAt = isPermanent ? null : new Date(createdAt.getTime() + THREE_DAYS_MS);

    if (expiresAt !== null && expiresAt.getTime() <= now.getTime()) {
      droppedExpired += 1;
      continue;
    }

    const kind = mediaKindOf(medium.type);
    const handle = `${kind}:${medium.media_id}`;
    if (taken.has(handle)) {
      droppedDuplicate += 1;
      continue;
    }
    taken.add(handle);

    rows.push({
      id: medium.id,
      kind,
      mediaId: medium.media_id,
      attachmentId: null,
      url: medium.url || null,
      isPermanent,
      expiresAt,
      createdAt,
    });
  }

  return { rows, droppedExpired, droppedNoHandle, droppedDuplicate };
}
