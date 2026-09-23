import { z } from 'zod';

import { ui } from './meta';

/**
 * Typed storefront links.
 *
 * DRAFT — moves to `@shop/contracts` in stream F1 (plan §2.1). A saved page
 * never stores a mini-program path: it stores *what* the link opens, and the
 * one route table in the contracts turns that into a path at the edge. Renaming
 * a page then never breaks saved data, and the same table serves mini-program
 * codes, subscription messages, posters and notification links.
 */

/** Decimal-string id, as everywhere in the API. */
const id = z.string().regex(/^[1-9]\d*$/, '请选择有效的记录');

/**
 * Fixed storefront destinations. DRAFT: the full catalogue is `storefrontRoute`
 * in the contracts (stream H1); these are the ones a decorated page links to.
 */
export const STOREFRONT_ROUTES = {
  home: '首页',
  category: '分类',
  cart: '购物车',
  user: '个人中心',
  search: '搜索',
  couponCenter: '领券中心',
  orders: '我的订单',
  groupbuyList: '拼团列表',
  presaleList: '预售列表',
  articleList: '资讯列表',
} as const;

export type StorefrontRoute = keyof typeof STOREFRONT_ROUTES;

export const storefrontRoute = z.enum(
  Object.keys(STOREFRONT_ROUTES) as [StorefrontRoute, ...StorefrontRoute[]],
);

export const LINK_KINDS = {
  product: '商品',
  category: '商品分类',
  article: '资讯',
  page: '微页面',
  route: '商城页面',
  webview: '网页',
  miniprogram: '其他小程序',
} as const;

export type LinkKind = keyof typeof LINK_KINDS;

export const linkTarget = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('product'), id }),
    z.object({ kind: z.literal('category'), id }),
    z.object({ kind: z.literal('article'), id }),
    /** A decorated micro page (a `diy_documents` row). */
    z.object({ kind: z.literal('page'), id }),
    z.object({ kind: z.literal('route'), route: storefrontRoute }),
    /**
     * A web page in `<web-view>`. The mini-program can only open verified
     * business domains; the resolver drops a link whose host is not on the list.
     */
    z.object({ kind: z.literal('webview'), url: z.url({ protocol: /^https$/ }) }),
    z.object({
      kind: z.literal('miniprogram'),
      appId: z.string().regex(/^wx[0-9a-f]{16}$/, '小程序 AppID 形如 wx 加 16 位十六进制'),
      path: z.string().max(256).optional(),
    }),
  ])
  .meta(ui({ label: '链接', field: 'link' }));

export type LinkTarget = z.infer<typeof linkTarget>;
