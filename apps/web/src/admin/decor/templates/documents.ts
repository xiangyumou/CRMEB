import type { StoredDocument } from '@shop/contracts/decor/document';
import type { LinkTarget } from '@shop/contracts/decor/link';

/**
 * The template documents. Quiet by design: a warm off-white page, generous
 * rounded cards, few words, no loud colour — the pictures and the products do
 * the talking, and the operator supplies both.
 *
 * Image slots are left empty on purpose (`image: ''`). A template cannot ship
 * the shop's photography, and a stock picture that slips through to a shopper
 * is worse than none: an empty slot is a `请选择图片` issue, listed under the
 * toolbar with 定位, and the page cannot be published until each one is
 * filled. The canvas draws an empty slot as a placeholder (`./canvas-images`).
 * Product grids start as an empty hand-picked list for the same reason: a
 * category rule needs this shop's category ids.
 *
 * Built from the blocks this build has. When the storefront's title bar,
 * notice and navigation-grid blocks land, the home and campaign templates
 * gain section headings and a category row.
 */

const everyone = { audience: 'all', platforms: [] } as const;

type Spacing = 'none' | 'sm' | 'md' | 'lg';
type Radius = 'none' | 'sm' | 'lg';

function style(marginY: Spacing, paddingX: Spacing, radius: Radius) {
  return { marginY, paddingX, radius };
}

function route(name: string, params: Record<string, string> = {}): LinkTarget {
  return { kind: 'route', to: { route: name, params } } as LinkTarget;
}

const WARM_WHITE = '#f7f5f2';

/** 首页 · 简约: hero, three entry tiles, then the products. */
export const HOME_MODERN: StoredDocument = {
  schemaVersion: 2,
  root: {
    props: { title: '首页', background: WARM_WHITE, shareEnabled: true, shareTitle: '' },
  },
  blocks: [
    {
      id: 'home-hero',
      type: 'carousel',
      v: 1,
      props: {
        slides: [
          { image: '', alt: '新品上市', link: route('featured', { tab: 'new' }) },
          { image: '', alt: '本周精选', link: route('featured', { tab: 'best' }) },
          { image: '', alt: '领券中心', link: route('couponCenter') },
        ],
        height: 400,
        autoplay: true,
        interval: 4000,
        indicator: 'dots',
        indicatorColor: '#ffffff80',
        indicatorActiveColor: '#ffffff',
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
    {
      id: 'home-entries',
      type: 'imageCube',
      v: 1,
      props: {
        layout: 'left1right2',
        cells: [
          { image: '', link: route('featured', { tab: 'new' }) },
          { image: '', link: route('featured', { tab: 'hot' }) },
          { image: '', link: route('couponCenter') },
        ],
        height: 340,
        gap: 12,
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
    {
      id: 'home-products',
      type: 'productGrid',
      v: 1,
      props: {
        source: { mode: 'manual', ids: [] },
        titleLines: 2,
        showMarketPrice: true,
        showTag: true,
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
  ],
};

/** 个人中心 · 简洁: the card, the orders, and the services in two quiet groups. */
export const USER_CENTER_CLEAN: StoredDocument = {
  schemaVersion: 2,
  root: {
    // Nobody shares their own account page.
    props: { title: '我的', background: WARM_WHITE, shareEnabled: false, shareTitle: '' },
  },
  blocks: [
    {
      id: 'me-card',
      type: 'userCard',
      v: 1,
      props: { showStats: true, style: style('none', 'none', 'none'), visibility: everyone },
    },
    {
      id: 'me-orders',
      type: 'orderEntry',
      v: 1,
      props: {
        title: '我的订单',
        items: [
          { key: 'unpaid', label: '待付款' },
          { key: 'unshipped', label: '待发货' },
          { key: 'unreceived', label: '待收货' },
          { key: 'unreviewed', label: '待评价' },
          { key: 'aftersale', label: '售后/退款' },
        ],
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
    {
      id: 'me-benefits',
      type: 'serviceGrid',
      v: 1,
      props: {
        title: '优惠与记录',
        columns: 4,
        items: [
          { label: '优惠券', link: route('myCoupons') },
          { label: '领券中心', link: route('couponCenter') },
          { label: '我的收藏', link: route('favorites') },
          { label: '浏览记录', link: route('history') },
        ],
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
    {
      id: 'me-account',
      type: 'serviceGrid',
      v: 1,
      props: {
        title: '账户与服务',
        columns: 4,
        items: [
          { label: '收货地址', link: route('addresses') },
          { label: '我的评价', link: route('myReviews') },
          { label: '发票管理', link: route('invoices') },
          { label: '消息中心', link: route('messages') },
          { label: '我的拼团', link: route('myGroupbuys') },
          { label: '设置', link: route('settings') },
        ],
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
  ],
};

/** 微页面 · 专题: one still hero, a feature and two tiles, then the products. */
export const CUSTOM_CAMPAIGN: StoredDocument = {
  schemaVersion: 2,
  root: {
    props: { title: '专题活动', background: '#ffffff', shareEnabled: true, shareTitle: '' },
  },
  blocks: [
    {
      id: 'topic-hero',
      type: 'carousel',
      v: 1,
      props: {
        slides: [{ image: '', alt: '专题主图' }],
        height: 480,
        autoplay: false,
        interval: 3000,
        indicator: 'none',
        indicatorColor: '#ffffff80',
        indicatorActiveColor: '#ffffff',
        style: style('none', 'none', 'none'),
        visibility: everyone,
      },
    },
    {
      id: 'topic-features',
      type: 'imageCube',
      v: 1,
      props: {
        layout: 'top1bottom2',
        cells: [
          { image: '', link: route('featured', { tab: 'best' }) },
          { image: '', link: route('couponCenter') },
          { image: '', link: route('featured', { tab: 'new' }) },
        ],
        height: 520,
        gap: 12,
        style: style('md', 'sm', 'lg'),
        visibility: everyone,
      },
    },
    {
      id: 'topic-products',
      type: 'productGrid',
      v: 1,
      props: {
        source: { mode: 'manual', ids: [] },
        titleLines: 1,
        showMarketPrice: true,
        showTag: false,
        style: style('sm', 'sm', 'lg'),
        visibility: everyone,
      },
    },
  ],
};
