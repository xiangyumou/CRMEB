import type {
  LinkPageGroup,
  LinkSource,
  LinkTarget,
  LinkTargetQuery,
  LinkTargetResult,
  LinkTargetType,
} from './types';

const PAGES: LinkPageGroup[] = [
  {
    group: '基础页面',
    items: [
      { id: 'home', name: '首页', url: '/pages/index/index' },
      { id: 'category', name: '分类', url: '/pages/goods_cate/goods_cate' },
      { id: 'cart', name: '购物车', url: '/pages/order_addcart/order_addcart' },
      { id: 'user', name: '个人中心', url: '/pages/user/index' },
    ],
  },
  {
    group: '订单',
    items: [
      { id: 'order-list', name: '我的订单', url: '/pages/users/order_list/index' },
      { id: 'order-refund', name: '退款列表', url: '/pages/users/user_return_list/index' },
    ],
  },
  {
    group: '营销',
    items: [
      { id: 'coupon', name: '领券中心', url: '/pages/users/user_get_coupon/index' },
      { id: 'groupbuy', name: '拼团', url: '/pages/activity/goods_combination/index' },
    ],
  },
];

const NAMES = ['秋季新款外套', '云南普洱茶饼', '无线蓝牙耳机', '厨房收纳三件套', '儿童绘本套装'];

function makeTargets(type: Exclude<LinkTargetType, 'page' | 'custom'>): LinkTarget[] {
  const prefix = { product: '/pages/goods_details/index?id=', category: '/pages/goods_list/index?cid=', article: '/pages/news_details/index?id=' }[type];
  const label = { product: '商品', category: '分类', article: '文章' }[type];
  return Array.from({ length: 23 }, (_, index) => ({
    id: String(index + 1),
    name: `${label}：${NAMES[index % NAMES.length]}${index >= NAMES.length ? ` ${index + 1}` : ''}`,
    url: `${prefix}${index + 1}`,
    subtitle: `ID ${index + 1}`,
  }));
}

/** In-memory `LinkSource` for Phase 0 and for the kit demo. */
export function createStubLinkSource(): LinkSource {
  const cache: Partial<Record<string, LinkTarget[]>> = {};

  return {
    async listPages() {
      return structuredClone(PAGES);
    },
    async listTargets(type, query: LinkTargetQuery): Promise<LinkTargetResult> {
      cache[type] ??= makeTargets(type);
      const all = cache[type] ?? [];
      const keyword = query.keyword?.trim();
      const filtered = keyword ? all.filter((item) => item.name.includes(keyword)) : all;
      const start = (query.page - 1) * query.pageSize;
      return { items: filtered.slice(start, start + query.pageSize), total: filtered.length };
    },
  };
}
