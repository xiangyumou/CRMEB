// 拼团 / 预售.
//
// Fixtures are the contracts' own examples, so a mapper is never tested against a
// payload the author of the test invented.

import { example, assertRenderable } from './helpers.mjs';
import {
  toLegacyGroupbuyCard,
  toLegacyGroupbuyList,
  toLegacyGroupbuyBanners,
  toLegacyOpenGroup,
  toLegacyGroupbuyDetail,
  toLegacyGroupbuyGroup,
  toLegacyGroupbuyPoster,
  toLegacyPresaleCard,
  toLegacyPresaleList,
  toLegacyPresaleDetail,
} from '../api/mappers/activity.js';

const ACTIVITY = 'GET /api/v1/groupbuy/activities/:id';
const GROUPS = 'GET /api/v1/groupbuy/activities/:id/groups';
const VIEW = 'GET /api/v1/groupbuy/groups/:id';

describe('groupbuy — 列表与 banner', () => {
  it('turns the page into the bare array the list concats onto', () => {
    const rows = toLegacyGroupbuyList(example('GET /api/v1/groupbuy/activities'));
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0]).toMatchObject({
      id: 1,
      product_id: 11,
      store_name: '三人成团 · 坚果礼盒',
      price: '59.00',
      ot_price: '88.00',
      people: 3,
      stock: 200,
      quota: 200,
      pink_count: 4,
      unit_name: '件',
      can_buy: true,
    });
    assertRenderable(rows);
  });

  it('keeps the countdown in unix seconds, which is what the timer subtracts from', () => {
    const row = toLegacyGroupbuyCard({ startAt: '2026-09-01T00:00:00+08:00', endAt: null });
    expect(row.start_time).toBe(1788192000);
    expect(row.stop_time).toBe(0);
  });

  it('pins the retired 会员价 / 门店自提 / 赠品 flags falsy so those branches stay dead', () => {
    const row = toLegacyGroupbuyCard(example('GET /api/v1/groupbuy/activities').items[0]);
    expect(row.is_vip).toBe(0);
    expect(row.vip_price).toBe(0);
    expect(row.svip_price_open).toBe(false);
    expect(row.store_self_mention).toBe(0);
    expect(row.is_gift).toBe(0);
  });

  it('gives the banner swiper both spellings of the image and never a null link', () => {
    const banners = toLegacyGroupbuyBanners(example('GET /api/v1/groupbuy/banners'));
    expect(banners).toHaveLength(2);
    expect(banners[0]).toEqual({
      img: 'https://cdn.example.com/banner/groupbuy-1.jpg',
      image: 'https://cdn.example.com/banner/groupbuy-1.jpg',
      link: '',
    });
    expect(banners[1].link).toBe('/pages/activity/groupbuy/index');
    expect(toLegacyGroupbuyBanners(null)).toEqual([]);
    assertRenderable(banners);
  });
});

describe('groupbuy — 详情（活动 + 正在拼单）', () => {
  it('composes the two reads into the one payload the page knows', () => {
    const detail = toLegacyGroupbuyDetail(example(ACTIVITY), example(GROUPS));
    expect(detail.storeInfo).toMatchObject({
      id: 1,
      product_id: 11,
      price: '59.00',
      people: 3,
      num: 1,
      once_num: 1,
      total: 200,
      effective_time: 86400,
      unique: '21',
      default_sku: '混合装,1000g',
      product_is_show: 1,
    });
    expect(detail.storeInfo.slider_image).toEqual(['https://cdn.example.com/p/11-1.jpg']);
    expect(detail.pink).toEqual([
      {
        id: 501,
        uid: 0,
        nickname: '小明',
        avatar: 'https://cdn.example.com/u/101.jpg',
        count: 1,
        people: 3,
        stop_time: 1790128800,
      },
    ]);
    expect(detail.pink_ok_sum).toBe(46);
    // 别人拼团成功 marquee has no successor: an empty list renders nothing.
    expect(detail.pink_ok_list).toEqual([]);
    assertRenderable(detail);
  });

  it('rebuilds the picker columns out of the SKUs own specValues', () => {
    const detail = toLegacyGroupbuyDetail(example(ACTIVITY), example(GROUPS));
    expect(detail.productAttr).toEqual([
      { attr_name: '口味', attr_values: ['混合装'], attr_value: [{ attr: '混合装', pic: '' }] },
      { attr_name: '规格', attr_values: ['1000g'], attr_value: [{ attr: '1000g', pic: '' }] },
    ]);
    // The picker looks the SKU up by the comma-joined spec string.
    expect(detail.productValue['混合装,1000g']).toMatchObject({
      unique: '21',
      price: '59.00',
      ot_price: '88.00',
      stock: 200,
      quota: 200,
    });
  });

  it('survives the 正在拼单 strip failing, because it is decoration', () => {
    const detail = toLegacyGroupbuyDetail(example(ACTIVITY), { items: [] });
    expect(detail.pink).toEqual([]);
    expect(detail.pinkAll).toEqual([]);
    expect(detail.storeInfo.id).toBe(1);
  });

  it('turns a null myOpenGroupId into 0, because the page compares it numerically', () => {
    expect(toLegacyGroupbuyDetail({ myOpenGroupId: null }).storeInfo.my_pink_id).toBe(0);
    expect(toLegacyGroupbuyDetail({ myOpenGroupId: '77' }).storeInfo.my_pink_id).toBe(77);
  });

  it('marks 单规格 as spec_type 0 so the picker is skipped', () => {
    expect(toLegacyGroupbuyDetail(example(ACTIVITY)).storeInfo.spec_type).toBe(0);
    const two = { ...example(ACTIVITY) };
    two.skus = [...two.skus, { ...two.skus[0], skuId: '22', specText: '原味|1000g' }];
    expect(toLegacyGroupbuyDetail(two).storeInfo.spec_type).toBe(1);
  });
});

describe('groupbuy — 团单状态页', () => {
  const build = () =>
    toLegacyGroupbuyGroup(example(VIEW), example(ACTIVITY), example('GET /api/v1/groupbuy/activities'));

  it('splits the members into the leader (pinkT) and everybody else (pinkAll)', () => {
    const g = build();
    expect(g.pinkT).toMatchObject({ id: 501, uid: 101, nickname: '小明', stop_time: 1790128800, people: 3 });
    expect(g.pinkAll).toEqual([
      { uid: 102, nickname: '小红', avatar: 'https://cdn.example.com/u/102.jpg' },
    ]);
    expect(g.count).toBe(1);
    assertRenderable(g);
  });

  it('derives the tri-state pinkBool from status rather than counting members', () => {
    expect(build().pinkBool).toBe(0);
    expect(toLegacyGroupbuyGroup({ status: 'succeeded' }).pinkBool).toBe(1);
    expect(toLegacyGroupbuyGroup({ status: 'failed' }).pinkBool).toBe(-1);
    expect(toLegacyGroupbuyGroup({ status: 'cancelled' }).pinkBool).toBe(-1);
  });

  it('only offers 取消开团 to the leader, via userInfo.uid matching pinkT.uid', () => {
    const view = example(VIEW);
    const asMember = toLegacyGroupbuyGroup(view, null, null);
    expect(asMember.userInfo.uid).toBe(0);
    expect(asMember.order_pid).toBe(1);

    const asLeader = toLegacyGroupbuyGroup(
      { ...view, me: { role: 'leader', status: 'joined', orderId: '7001', paid: true } },
      null,
      null,
    );
    expect(asLeader.userInfo.uid).toBe(101);
    expect(asLeader.userInfo.uid).toBe(asLeader.pinkT.uid);
    expect(asLeader.order_pid).toBe(0);
  });

  it('answers userBool 0 for a visitor who is not in the team', () => {
    const g = toLegacyGroupbuyGroup({ ...example(VIEW), me: null, canJoin: true }, null, null);
    expect(g.userBool).toBe(0);
    expect(g.current_pink_order).toBe('');
    // `is_ok` is "cannot join" — joinable means 0.
    expect(g.is_ok).toBe(0);
  });

  it('drops the group own activity out of the 大家都在拼 strip', () => {
    // the sibling page is activity 1, which is this very group's activity
    expect(build().store_combination_host).toEqual([]);
  });

  it('still renders the product card when the activity read failed', () => {
    const g = toLegacyGroupbuyGroup(example(VIEW), null, null);
    expect(g.store_combination).toMatchObject({ id: 1, title: '三人成团 · 坚果礼盒', price: '59.00', people: 3 });
    expect(g.store_combination.productAttr).toEqual([]);
    expect(g.store_combination.productValue).toEqual({});
  });
});

describe('groupbuy — 海报', () => {
  it('composes the label and the 还差 N 人 line the canvas prints', () => {
    const poster = toLegacyGroupbuyPoster(example('GET /api/v1/groupbuy/groups/:id/poster'));
    expect(poster).toMatchObject({
      id: 501,
      title: '三人成团 · 坚果礼盒',
      price: '59.00',
      count: 1,
      label: '拼团',
      msg: '还差1人成团',
      nickname: '小明',
    });
    // legacy handed over a rendered QR image; the new contract hands over its payload
    expect(poster.url).toBe('');
    expect(poster.qr_payload).toContain('groupId=501');
    assertRenderable(poster);
  });

  it('says 拼团成功 once the last seat is taken', () => {
    expect(toLegacyGroupbuyPoster({ seatsLeft: 0 }).msg).toBe('拼团成功');
  });
});

describe('presale — 预售', () => {
  it('pages the list the way the 预售 page reads it', () => {
    const paged = toLegacyPresaleList(example('GET /api/v1/presale/activities'));
    expect(paged).toMatchObject({ count: 1, page: 1, limit: 20 });
    expect(paged.list[0]).toMatchObject({
      id: 2,
      product_id: 12,
      store_name: '春茶预售 · 明前龙井',
      price: '128.00',
      ot_price: '168.00',
      deliver_time: 15,
      presell_type: 1,
      pay_status: 1,
      start_time: '2026-09-01',
      stop_time: '2026-11-30',
    });
    assertRenderable(paged);
  });

  it('pins 全款预售, because D refuses a 定金 activity outright', () => {
    expect(toLegacyPresaleCard({ presell_type: 2 }).presell_type).toBe(1);
    expect(toLegacyPresaleDetail(example('GET /api/v1/presale/activities/:id')).pay_status).toBe(1);
  });

  it('shapes the detail like a product detail so the page needs no edit', () => {
    const detail = toLegacyPresaleDetail(example('GET /api/v1/presale/activities/:id'));
    expect(detail.storeInfo).toMatchObject({
      id: 2,
      store_name: '春茶预售 · 明前龙井',
      num: 5,
      once_num: 5,
      unique: '31',
      default_sku: '特级,250g',
      spec_type: 0,
    });
    expect(detail.storeInfo.slider_image).toEqual(['https://cdn.example.com/p/12-1.jpg']);
    expect(detail.productAttr).toHaveLength(2);
    expect(detail.productValue['特级,250g']).toMatchObject({ unique: '31', price: '128.00', stock: 500 });
    assertRenderable(detail);
  });

  it('answers {} rather than throwing on an empty payload', () => {
    expect(toLegacyPresaleDetail(null)).toEqual({});
    expect(toLegacyPresaleCard(null)).toEqual({});
    expect(toLegacyGroupbuyDetail(null)).toEqual({});
    expect(toLegacyGroupbuyGroup(null)).toEqual({});
    expect(toLegacyOpenGroup(null)).toEqual({});
    expect(toLegacyGroupbuyPoster(null)).toEqual({});
  });
});
