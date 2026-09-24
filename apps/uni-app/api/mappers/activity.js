// 拼团 / 预售 DTOs → the 活动 view models `pages/activity/**` render.
//
// Contracts: packages/contracts/src/groupbuy/groupbuy.storefront.contract.ts
//            packages/contracts/src/presale/presale.storefront.contract.ts
//
// Three things about the API the mappers have to bridge:
//
//  * **A group is a row with a seat counter**, not a list of participants to count.
//    `pinkBool` / `count` / `userBool` are all derived from `status`, `seatsLeft` and
//    whether `me` is null, instead of the page counting an array.
//  * **The activity page and the 拼单 strip are two reads.** `groupbuyDetail` carries
//    the product, `…/groups` carries the teams still looking for members, so
//    `getCombinationDetail` composes them into the one payload the page knows.
//  * **The server never draws a poster.** `groupbuyPoster` hands over the pieces and
//    the payload a QR code must encode; a server-drawn PNG would leave one
//    attachment behind per group.
//
// Retired next to a product: 会员价, 积分, 门店自提, 虚拟核销. They are pinned to falsy
// constants here exactly as `mappers/catalog.js` pins them, so the page branches that
// render them stay dead without the pages being edited.

import {
  toId,
  toInt,
  money,
  text,
  list,
  mapList,
  pagedList,
  pageDate,
  unixSeconds,
} from './_shared.js';
import { toPageProductAttr, toPageProductValue } from './catalog.js';

/** Same falsy bag `mappers/catalog.js` uses, so an activity product behaves like any other. */
const RETIRED = {
  is_vip: 0,
  vip_price: 0,
  svip_price_open: false,
  store_self_mention: 0,
  is_gift: 0,
  routine_contact_type: 0,
};

// ---------------------------------------------------------------------------
// 拼团
// ---------------------------------------------------------------------------

/** `groupbuyCard` → one row of 拼团列表 / the DIY 拼团 component. */
export function toPageGroupbuyCard(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.activityId),
    product_id: toId(dto.productId),
    title: text(dto.title),
    store_name: text(dto.title),
    info: text(dto.intro),
    image: text(dto.imageUrl),
    price: money(dto.price),
    // The card prints `product_price` as the struck-through original.
    product_price: money(dto.originalPrice, ''),
    ot_price: money(dto.originalPrice, ''),
    people: toInt(dto.seatsRequired, 2),
    stock: toInt(dto.stock, 0),
    // 限量 (`quota`) gates the 去拼团 button; the API has only stock.
    quota: toInt(dto.stock, 0),
    sales: toInt(dto.sales, 0),
    unit_name: '件',
    pink_count: toInt(dto.formingGroups, 0),
    start_time: unixSeconds(dto.startAt),
    stop_time: unixSeconds(dto.endAt),
    can_buy: dto.canBuy !== false,
    ...RETIRED,
  };
}

/** `pagedGroupbuyCards` → the bare array the list pages page through. */
export function toPageGroupbuyList(dto) {
  return mapList(dto && dto.items, toPageGroupbuyCard);
}

/** `GET /api/v1/groupbuy/banners` → `[{img, link}]`, which is all the swiper reads. */
export function toPageGroupbuyBanners(dto) {
  return mapList(dto && dto.items, (b) => ({
    img: text(b && b.imageUrl),
    image: text(b && b.imageUrl),
    link: text(b && b.link),
  }));
}

/**
 * `GET /api/v1/groupbuy/summary` → the 人气条 on 拼团列表 and the DIY 拼团 block:
 * `avatars` (a bare array of URLs, ≤ 8) and `pink_count` for 「N 人参与拼团」.
 */
export function toPageGroupbuySummary(dto) {
  return {
    avatars: list(dto && dto.avatars)
      .map((url) => text(url))
      .filter(Boolean),
    pink_count: toInt(dto && dto.participants, 0),
  };
}

/** `groupbuyOpenGroup` → one row of the 正在拼单 strip. */
export function toPageOpenGroup(dto) {
  if (!dto) return {};
  return {
    id: toId(dto.groupId),
    uid: 0,
    nickname: text(dto.leaderNickname),
    avatar: text(dto.leaderAvatarUrl),
    count: toInt(dto.seatsLeft, 0),
    people: toInt(dto.seatsTotal, 2),
    stop_time: unixSeconds(dto.expiresAt),
  };
}

/**
 * `groupbuyDetail` (+ the open groups) → the 拼团详情 payload.
 *
 * `pink_ok_list` is a marquee of "某某 拼团成功" strings built from other people's
 * orders. The API does not publish other buyers' names, so it is an empty list and
 * the marquee renders nothing. `pink_ok_sum` keeps working: it is just `sales`.
 */
export function toPageGroupbuyDetail(dto, groups) {
  if (!dto) return {};
  const skus = list(dto.skus);
  const first = skus[0];
  const card = toPageGroupbuyCard(dto);
  return {
    storeInfo: {
      ...card,
      images: mapList(dto.sliderImages, (u) => text(u)),
      slider_image: mapList(dto.sliderImages, (u) => text(u)),
      description: text(dto.description),
      spec_type: skus.length > 1 ? 1 : 0,
      num: toInt(dto.perOrderQuantity, 1),
      once_num: toInt(dto.perOrderQuantity, 1),
      total: toInt(dto.stock, 0),
      effective_time: toInt(dto.groupTtlSeconds, 0),
      unique: first ? text(first.skuId) : '',
      default_sku: first ? text(first.specText).split('|').join(',') : '',
      // 收藏 hangs off the product, and the activity DTO does not carry it.
      userCollect: false,
      product_is_show: 1,
      command_word: '',
      wechat_code: '',
      code_base: '',
      // `myOpenGroupId` is `null` for a visitor we do not know, which is not the
      // same as "cannot open a team" — the page only needs the id.
      my_pink_id: dto.myOpenGroupId === null || dto.myOpenGroupId === undefined ? 0 : toId(dto.myOpenGroupId),
    },
    productAttr: toPageProductAttr(specsOf(dto)),
    productValue: toPageProductValue(skusAsCatalog(dto), dto.title),
    pink: mapList(groups && groups.items, toPageOpenGroup),
    pinkAll: mapList(groups && groups.items, toPageOpenGroup),
    pink_ok_list: [],
    pink_ok_sum: toInt(dto.sales, 0),
    reply: null,
    replyCount: 0,
    replyChance: 0,
    ...RETIRED,
  };
}

/**
 * The activity SKUs carry `specValues` (a name → value map) rather than the
 * product's `specs` array, so the picker's columns are rebuilt from them. Insertion
 * order of the first SKU decides the column order, which is the order the admin
 * saved the spec in.
 */
function specsOf(dto) {
  const skus = list(dto && dto.skus);
  const names = [];
  const values = {};
  for (const sku of skus) {
    const pairs = (sku && sku.specValues) || {};
    for (const name of Object.keys(pairs)) {
      if (names.indexOf(name) === -1) {
        names.push(name);
        values[name] = [];
      }
      const value = text(pairs[name]);
      if (values[name].indexOf(value) === -1) values[name].push(value);
    }
  }
  return names.map((name) => ({
    name,
    values: values[name].map((v) => ({ value: v, imageUrl: '' })),
  }));
}

/** An activity SKU wearing the field names `toPageSku` reads. */
function skusAsCatalog(dto) {
  return mapList(dto && dto.skus, (sku) => ({
    id: sku.skuId,
    specText: sku.specText,
    skuCode: '',
    imageUrl: sku.imageUrl,
    price: sku.price,
    originalPrice: sku.originalPrice,
    stock: sku.stock,
  }));
}

/** `groupbuyGroupStatus` → the page's tri-state `pinkBool`. */
function pinkBoolOf(status) {
  if (status === 'succeeded') return 1;
  if (status === 'failed' || status === 'cancelled') return -1;
  return 0;
}

/**
 * `groupbuyGroupView` (+ the activity and a few sibling activities) → the 拼团状态页.
 *
 * The group view carries no account ids (RISK-D-010), so every `uid` here is 0 and the
 * page decides whether to offer 取消开团 from `pinkT.isMine` — the caller is the
 * leader — rather than by comparing ids. The nickname is the leader's (masked) either
 * way: the H5 share text is an invitation from the team.
 */
export function toPageGroupbuyGroup(view, detail, siblings) {
  if (!view) return {};
  const members = list(view.members);
  const leader = members.find((m) => m.role === 'leader') || members[0] || null;
  const me = view.me || null;
  const isLeader = !!me && me.role === 'leader';
  const product = detail ? toPageGroupbuyDetail(detail) : null;
  return {
    store_combination: Object.assign(
      product ? product.storeInfo : {},
      {
        id: toId(view.activityId),
        title: text(view.title),
        image: text(view.imageUrl),
        price: money(view.price),
        people: toInt(view.seatsTotal, 2),
      },
      product
        ? { productAttr: product.productAttr, productValue: product.productValue }
        : { productAttr: [], productValue: {} },
    ),
    store_combination_host: mapList(siblings && siblings.items, toPageGroupbuyCard).filter(
      (row) => String(row.id) !== String(toId(view.activityId)),
    ),
    pinkT: {
      id: toId(view.groupId),
      uid: 0,
      isMine: isLeader,
      nickname: leader ? text(leader.nickname) : '',
      avatar: leader ? text(leader.avatarUrl) : '',
      stop_time: unixSeconds(view.expiresAt),
      people: toInt(view.seatsTotal, 2),
      status: pinkBoolOf(view.status),
    },
    // The leader is rendered separately, so `pinkAll` is everybody else.
    pinkAll: members
      .filter((m) => m !== leader)
      .map((m) => ({
        uid: 0,
        nickname: text(m.nickname),
        avatar: text(m.avatarUrl),
      })),
    count: toInt(view.seatsLeft, 0),
    userBool: me ? 1 : 0,
    pinkBool: pinkBoolOf(view.status),
    // `is_ok` gates the 「你不是该团的成员」 warning; "cannot join" is the
    // same question asked the other way round.
    is_ok: view.canJoin ? 0 : 1,
    current_pink_order: me ? text(me.orderId) : '',
    order_pid: isLeader ? 0 : 1,
    userInfo: {
      uid: 0,
      nickname: leader ? text(leader.nickname) : '',
      avatar: leader ? text(leader.avatarUrl) : '',
    },
  };
}

/**
 * `groupbuyPoster` → what `pages/activity/poster-poster` draws.
 *
 * The page's `url` is a **rendered** QR image; the contract hands over `qrPayload` (what the code encodes) and leaves the
 * drawing to the client, so `url` is empty and the page falls back to the
 * mini-program code it fetched separately. `label` and `msg` are composed here from the seat counter instead.
 */
export function toPageGroupbuyPoster(dto) {
  if (!dto) return {};
  const left = toInt(dto.seatsLeft, 0);
  return {
    id: toId(dto.groupId),
    title: text(dto.title),
    image: text(dto.imageUrl),
    price: money(dto.price),
    ot_price: money(dto.originalPrice, ''),
    count: left,
    label: '拼团',
    msg: left > 0 ? `还差${left}人成团` : '拼团成功',
    stop_time: unixSeconds(dto.expiresAt),
    nickname: text(dto.leaderNickname),
    avatar: text(dto.leaderAvatarUrl),
    url: '',
    // The client draws the QR code itself; the server hands over what it encodes.
    qr_payload: text(dto.qrPayload),
    page: text(dto.page),
  };
}

// ---------------------------------------------------------------------------
// 预售
// ---------------------------------------------------------------------------

/**
 * The 预售 pages' `pay_status`: 1 未开始 · 2 进行中 · 3 已结束 — the three buttons
 * `presell_details` switches between. Pinning it to 1 would hide 立即购买 and label
 * every activity 未开始, so it follows the activity window. The clock is injectable so the mapper stays deterministic.
 */
export function presaleWindowStatus(dto, now = Date.now()) {
  const start = Date.parse(text(dto && dto.startAt));
  const end = Date.parse(text(dto && dto.endAt));
  if (!Number.isNaN(start) && now < start) return 1;
  if (!Number.isNaN(end) && now > end) return 3;
  return 2;
}

/** `presaleCard` → one row of 预售列表. */
export function toPagePresaleCard(dto, now = Date.now()) {
  if (!dto) return {};
  return {
    id: toId(dto.activityId),
    product_id: toId(dto.productId),
    title: text(dto.title),
    store_name: text(dto.title),
    info: text(dto.intro),
    image: text(dto.imageUrl),
    price: money(dto.price),
    ot_price: money(dto.originalPrice, ''),
    product_price: money(dto.originalPrice, ''),
    stock: toInt(dto.stock, 0),
    quota: toInt(dto.stock, 0),
    sales: toInt(dto.sales, 0),
    unit_name: '件',
    // 全款预售 only: the server refuses a 定金 activity with `PRESALE_DEPOSIT_NOT_SUPPORTED`.
    presell_type: 1,
    pay_status: presaleWindowStatus(dto, now),
    deliver_time: toInt(dto.shipAfterDays, 0),
    presale_start_time: unixSeconds(dto.startAt),
    presale_end_time: unixSeconds(dto.endAt),
    start_time: pageDate(dto.startAt),
    stop_time: pageDate(dto.endAt),
    coupon: null,
    can_buy: dto.canBuy !== false,
    ...RETIRED,
  };
}

/** `pagedPresaleCards` → `{list, count, page, limit}`; the 预售 page reads `data.list`. */
export function toPagePresaleList(dto) {
  return pagedList(dto, toPagePresaleCard);
}

/** `presaleDetail` → the 预售详情 payload, shaped like a product detail. */
export function toPagePresaleDetail(dto, now = Date.now()) {
  if (!dto) return {};
  const skus = list(dto.skus);
  const first = skus[0];
  const card = toPagePresaleCard(dto, now);
  return {
    storeInfo: {
      ...card,
      images: mapList(dto.sliderImages, (u) => text(u)),
      slider_image: mapList(dto.sliderImages, (u) => text(u)),
      description: text(dto.description),
      spec_type: skus.length > 1 ? 1 : 0,
      num: toInt(dto.perOrderQuantity, 1),
      once_num: toInt(dto.perOrderQuantity, 1),
      unique: first ? text(first.skuId) : '',
      default_sku: first ? text(first.specText).split('|').join(',') : '',
      userCollect: false,
      product_is_show: 1,
      command_word: '',
      wechat_code: '',
      code_base: '',
    },
    productAttr: toPageProductAttr(specsOf(dto)),
    productValue: toPageProductValue(skusAsCatalog(dto), dto.title),
    // 1 未开始 · 2 进行中 · 3 已结束 (not 定金/尾款 — 定金预售 is refused by the server).
    pay_status: card.pay_status,
    reply: null,
    replyCount: 0,
    replyChance: 0,
    ...RETIRED,
  };
}
