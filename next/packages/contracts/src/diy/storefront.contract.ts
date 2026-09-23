import { z } from 'zod';

import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  PRODUCT_DETAIL_DEFAULT_VALUE,
  PRODUCT_DETAIL_DEFAULT_VERSION,
} from './product-detail.default';
import {
  diyLayout,
  diyLayoutType,
  diyNavigation,
  diyProductDetailPage,
  diyStorefrontPage,
  diyStorefrontPageExample,
  diyStorefrontTheme,
  diyVersion,
} from './schemas';

/**
 * 页面装修 — what the uni-app renderer reads.
 *
 * Public: the decorated home page is the first thing a cold visitor sees, and
 * the legacy `/api/diy/get_diy` was open too. Nothing user-specific is in the
 * payload; the components that need a login fetch their own data.
 *
 * Every response carries `version`, and the handlers also set it as the `ETag`.
 * The app polls the cheap `/version` route on resume and only re-fetches the
 * page when the string changed — the same trick as the legacy
 * `get_diy_version`, which existed because the payload is large and changes
 * rarely.
 */

export const diyHomePage = defineRoute({
  id: 'diy.homePage',
  method: 'GET',
  path: '/api/v1/diy/pages/home',
  auth: 'public',
  summary: '首页装修数据',
  tags: ['diy'],
  response: diyStorefrontPage,
  errors: ['DIY_HOME_PAGE_MISSING'],
  examples: [{ name: 'ok', response: diyStorefrontPageExample }],
});

export const diyPage = defineRoute({
  id: 'diy.page',
  method: 'GET',
  path: '/api/v1/diy/pages/:id',
  auth: 'public',
  summary: '装修页面数据',
  tags: ['diy'],
  params: z.object({ id }),
  response: diyStorefrontPage,
  errors: ['DIY_PAGE_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyStorefrontPageExample }],
});

/**
 * 个人中心 (CR-3-h2 §1).
 *
 * A separate route rather than a slug on `pages/:id`, which the CR offered as
 * an alternative: `:id` is `z.string().regex(/^\d+$/)` everywhere in these
 * contracts, and widening it so one caller can pass a word would weaken the
 * param for the other twenty routes that share it. A fixed path costs one
 * file.
 *
 * Same envelope as `pages/:id`, so the renderer needs nothing new — including
 * `version`, so the app polls 个人中心 exactly the way it polls the home page.
 */
export const diyUserCenterPage = defineRoute({
  id: 'diy.userCenterPage',
  method: 'GET',
  path: '/api/v1/diy/pages/user-center',
  auth: 'public',
  summary: '个人中心装修数据',
  tags: ['diy'],
  response: diyStorefrontPage,
  errors: ['DIY_USER_CENTER_PAGE_MISSING'],
  examples: [
    {
      name: 'ok',
      response: {
        ...diyStorefrontPageExample,
        id: '4',
        name: '个人中心',
        kind: 'user_center',
        title: '我的',
      },
    },
  ],
});

/**
 * 商品详情 (CR-2-h3).
 *
 * `pages/goods_details/index.vue` renders its whole body — gallery, price,
 * specs, 服务, 评价, 图文详情 — through `PageDesign`, so without this read the
 * product page is blank above the bottom bar. Same fixed-path shape as
 * `pages/user-center`: the newest published `product_detail` page.
 *
 * Unlike 个人中心 it never 404s. A shop that never decorated its product page
 * still sells products, so the answer is then the built-in default
 * (`PRODUCT_DETAIL_DEFAULT_VALUE`, the legacy install's own default detail
 * page) with `id: null`. A draft is never served.
 */
export const diyProductDetailPageRoute = defineRoute({
  id: 'diy.productDetailPage',
  method: 'GET',
  path: '/api/v1/diy/pages/product-detail',
  auth: 'public',
  summary: '商品详情装修数据',
  tags: ['diy'],
  response: diyProductDetailPage,
  examples: [
    // First on purpose: the mock server answers with the first example, and a
    // mock product page should look like a real shop's first product page.
    {
      name: 'built-in default',
      response: {
        id: null,
        name: '商品详情',
        kind: 'product_detail',
        title: '商品详情',
        content: PRODUCT_DETAIL_DEFAULT_VALUE,
        schemaVersion: 1,
        background: null,
        version: PRODUCT_DETAIL_DEFAULT_VERSION,
      },
    },
    {
      name: 'published',
      response: {
        ...diyStorefrontPageExample,
        id: '5',
        name: '商品详情',
        kind: 'product_detail',
        title: '商品详情',
      },
    },
  ],
});

/**
 * 底部导航 — legacy `getNavigation` (CR-3-h2 §2).
 *
 * The legacy reader took the live home page's saved components and picked the
 * one named `pagefoot`, case-insensitively. This does the same, off the same
 * page, so an operator decorates the tab bar where they always did and no
 * second surface has to be kept in step.
 */
export const diyNavigationRoute = defineRoute({
  id: 'diy.navigation',
  method: 'GET',
  path: '/api/v1/diy/navigation',
  auth: 'public',
  summary: '底部导航',
  tags: ['diy'],
  response: diyNavigation,
  examples: [
    {
      name: 'decorated',
      response: {
        navigation: {
          name: 'pageFoot',
          effectConfig: { tabVal: 1 },
          navStyleConfig: { tabVal: 0 },
          menuList: [
            {
              name: '首页',
              link: '/pages/index/index',
              imgList: ['/uploads/tab-home-on.png', '/uploads/tab-home.png'],
            },
          ],
        },
        version: '1716451200000',
      },
    },
    // The shop uses the native tab bar. Not an error.
    { name: 'none', response: { navigation: null, version: '1716451200000' } },
  ],
});

/**
 * 版式 — which built-in layout 分类页 / 个人中心 use (CR-3-h2 §3).
 *
 * Always answers. A shop that never picked gets 版式一, which is what the
 * legacy call's failure branch fell back to, so an unconfigured install and a
 * broken one look the same to the app — on purpose, because they should.
 */
export const diyLayoutRoute = defineRoute({
  id: 'diy.layout',
  method: 'GET',
  path: '/api/v1/diy/layouts/:type',
  auth: 'public',
  summary: '分类页 / 个人中心版式',
  tags: ['diy'],
  params: z.object({ type: diyLayoutType }),
  response: diyLayout,
  examples: [
    { name: 'category', params: { type: 'category' }, response: { status: 1 } },
    { name: 'user', params: { type: 'user' }, response: { status: 2 } },
  ],
});

export const diyPageVersion = defineRoute({
  id: 'diy.pageVersion',
  method: 'GET',
  path: '/api/v1/diy/version',
  auth: 'public',
  summary: '装修数据版本号',
  tags: ['diy'],
  query: z.object({ id: id.optional() }),
  response: z.object({ version: diyVersion }),
  errors: ['DIY_HOME_PAGE_MISSING', 'DIY_PAGE_NOT_FOUND'],
  examples: [{ name: 'ok', query: {}, response: { version: '1716451200000' } }],
});

export const diyTheme = defineRoute({
  id: 'diy.theme',
  method: 'GET',
  path: '/api/v1/diy/theme',
  auth: 'public',
  summary: '当前主题',
  tags: ['diy'],
  response: diyStorefrontTheme,
  errors: ['DIY_THEME_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      response: {
        id: '1',
        name: '默认主题',
        tokens: { theme: '#E93323', accent: '#FF7E00' },
        version: '1716451200000',
      },
    },
  ],
});
