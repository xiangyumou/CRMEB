// 拼团 / 预售 DTOs → the legacy 活动 view models `pages/activity/**` render.
//
// Contracts: next/packages/contracts/src/groupbuy/groupbuy.storefront.contract.ts
//            next/packages/contracts/src/presale/presale.storefront.contract.ts
//
// Three things about the new model the mappers have to bridge:
//
//  * **A group is a row with a seat counter**, not a list of participants to count.
//    `pinkBool` / `count` / `userBool` are all derived from `status`, `seatsLeft` and
//    whether `me` is null, instead of the page counting an array.
//  * **The activity page and the 拼单 strip are two reads.** `groupbuyDetail` carries
//    the product, `…/groups` carries the teams still looking for members, so
//    `getCombinationDetail` composes them into the one payload the page knows.
//  * **The server never draws a poster.** `groupbuyPoster` hands over the pieces and
//    the payload a QR code must encode; legacy rendered a PNG with GD and leaked one
//    attachment per group.
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
  legacyDate,
  unixSeconds,
} from './_shared.js';
import { toLegacyProductAttr, toLegacyProductValue } from './catalog.js';

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
export function toLegacyGroupbuyCard(dto) {
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
    // Legacy 限量 (`quota`) gates the 去拼团 button; the new model has only stock.
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
export function toLegacyGroupbuyList(dto) {
  return mapList(dto && dto.items, toLegacyGroupbuyCard);
}

/** `GET /api/v1/groupbuy/banners` → `[{img, link}]`, which is all the swiper reads. */
export function toLegacyGroupbuyBanners(dto) {
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
export function toLegacyGroupbuySummary(dto) {
  return {
    avatars: list(dto && dto.avatars)
      .map((url) => text(url))
      .filter(Boolean),
    pink_count: toInt(dto && dto.participants, 0),
  };
}

/** `groupbuyOpenGroup` → one row of the 正在拼单 strip. */
export function toLegacyOpenGroup(dto) {
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
 * `pink_ok_list` was a marquee of "某某 拼团成功" strings the legacy detail route
 * assembled from other people's orders. Nothing replaces it — publishing other
 * buyers' names was never something the new API offers — so it is an empty list and
 * the marquee renders nothing. `pink_ok_sum` keeps working: it is just `sales`.
 */
export function toLegacyGroupbuyDetail(dto, groups) {
  if (!dto) return {};
  const skus = list(dto.skus);
  const first = skus[0];
  const card = toLegacyGroupbuyCard(dto);
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
    productAttr: toLegacyProductAttr(specsOf(dto)),
    productValue: toLegacyProductValue(skusAsCatalog(dto), dto.title),
    pink: mapList(groups && groups.items, toLegacyOpenGroup),
    pinkAll: mapList(groups && groups.items, toLegacyOpenGroup),
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

/** An activity SKU wearing the field names `toLegacySku` reads. */
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
 * `userInfo.uid` is the **leader's** id when the caller is the leader and 0 otherwise,
 * because the page decides whether to offer 取消开团 by comparing it with `pinkT.uid`
 * and the group view deliberately never says who the caller is. The nickname is the
 * leader's either way: the H5 share text is an invitation from the team.
 */
export function toLegacyGroupbuyGroup(view, detail, siblings) {
  if (!view) return {};
  const members = list(view.members);
  const leader = members.find((m) => m.role === 'leader') || members[0] || null;
  const me = view.me || null;
  const isLeader = !!me && me.role === 'leader';
  const product = detail ? toLegacyGroupbuyDetail(detail) : null;
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
    store_combination_host: mapList(siblings && siblings.items, toLegacyGroupbuyCard).filter(
      (row) => String(row.id) !== String(toId(view.activityId)),
    ),
    pinkT: {
      id: toId(view.groupId),
      uid: leader ? toId(leader.userId) : 0,
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
        uid: toId(m.userId),
        nickname: text(m.nickname),
        avatar: text(m.avatarUrl),
      })),
    count: toInt(view.seatsLeft, 0),
    userBool: me ? 1 : 0,
    pinkBool: pinkBoolOf(view.status),
    // Legacy `is_ok` gated the 「你不是该团的成员」 warning; "cannot join" is the
    // same question asked the other way round.
    is_ok: view.canJoin ? 0 : 1,
    current_pink_order: me ? text(me.orderId) : '',
    order_pid: isLeader ? 0 : 1,
    userInfo: {
      uid: isLeader && leader ? toId(leader.userId) : 0,
      nickname: leader ? text(leader.nickname) : '',
      avatar: leader ? text(leader.avatarUrl) : '',
    },
  };
}

/**
 * `groupbuyPoster` → what `pages/activity/poster-poster` draws.
 *
 * The page's `url` was the **rendered** QR image the legacy poster route returned;
 * the new contract hands over `qrPayload` (what the code encodes) and leaves the
 * drawing to the client, so `url` is empty and the page falls back to the
 * mini-program code it fetched separately. `label` and `msg` were server-composed
 * strings; they are composed here from the seat counter instead.
 */
export function toLegacyGroupbuyPoster(dto) {
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

/** `presaleCard` → one row of 预售列表. */
export function toLegacyPresaleCard(dto) {
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
    // 全款预售 only: D refuses a 定金 activity with `PRESALE_DEPOSIT_NOT_SUPPORTED`.
    presell_type: 1,
    pay_status: 1,
    deliver_time: toInt(dto.shipAfterDays, 0),
    presale_start_time: unixSeconds(dto.startAt),
    presale_end_time: unixSeconds(dto.endAt),
    start_time: legacyDate(dto.startAt),
    stop_time: legacyDate(dto.endAt),
    coupon: null,
    can_buy: dto.canBuy !== false,
    ...RETIRED,
  };
}

/** `pagedPresaleCards` → `{list, count, page, limit}`; the 预售 page reads `data.list`. */
export function toLegacyPresaleList(dto) {
  return pagedList(dto, toLegacyPresaleCard);
}

/** `presaleDetail` → the 预售详情 payload, shaped like a product detail. */
export function toLegacyPresaleDetail(dto) {
  if (!dto) return {};
  const skus = list(dto.skus);
  const first = skus[0];
  const card = toLegacyPresaleCard(dto);
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
    productAttr: toLegacyProductAttr(specsOf(dto)),
    productValue: toLegacyProductValue(skusAsCatalog(dto), dto.title),
    // 定金预售 is not supported, so the 尾款 branch never renders.
    pay_status: 1,
    reply: null,
    replyCount: 0,
    replyChance: 0,
    ...RETIRED,
  };
}
