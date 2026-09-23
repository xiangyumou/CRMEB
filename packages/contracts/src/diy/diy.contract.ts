import { z } from 'zod';

import { id, pageQuery, paged, sortQuery } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  diyLink,
  diyLinkBody,
  diyLinkCategory,
  diyLinkCategoryExample,
  diyLinkExample,
  diyLinkListQuery,
  diyPageContentBody,
  diyPageCopyBody,
  diyPageCreateBody,
  diyPageDetail,
  diyPageDetailExample,
  diyPageListQuery,
  diyPageSummary,
  diyPageSummaryExample,
  diyPageUpdateBody,
  diyTheme,
  diyThemeExample,
  diyThemeUpdateBody,
} from './schemas';

/**
 * 页面装修 — the admin surface.
 *
 * A page is one resource: settings and content have separate routes so renaming
 * a page does not rewrite its components, and the non-CRUD verbs are
 * sub-resource POSTs as the conventions require.
 */

const pageParams = z.object({ id });

export const diyPageList = defineRoute({
  id: 'diy.adminPageList',
  method: 'GET',
  path: '/admin-api/diy/pages',
  auth: 'admin',
  permission: 'diy:page:read',
  summary: '装修页面列表',
  tags: ['diy'],
  query: pageQuery
    .extend(diyPageListQuery.shape)
    .extend(sortQuery(['updatedAt', 'createdAt', 'name']).shape),
  response: paged(diyPageSummary),
  examples: [
    {
      name: 'ok',
      query: { page: 1, pageSize: 20 },
      response: { items: [diyPageSummaryExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

export const diyPageGet = defineRoute({
  id: 'diy.adminPageGet',
  method: 'GET',
  path: '/admin-api/diy/pages/:id',
  auth: 'admin',
  permission: 'diy:page:read',
  summary: '装修页面详情',
  tags: ['diy'],
  params: pageParams,
  response: diyPageDetail,
  errors: ['DIY_PAGE_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyPageDetailExample }],
});

/**
 * A new 个人中心 or 商品详情 page starts with the built-in page the storefront
 * shows until one is published; every other kind starts empty.
 */
export const diyPageCreate = defineRoute({
  id: 'diy.adminPageCreate',
  method: 'POST',
  path: '/admin-api/diy/pages',
  auth: 'admin',
  permission: 'diy:page:create',
  summary: '新建装修页面',
  tags: ['diy'],
  body: diyPageCreateBody,
  response: diyPageDetail,
  status: 201,
  examples: [
    {
      name: 'ok',
      body: { name: '活动专题页', kind: 'micro' },
      response: { ...diyPageDetailExample, content: {} },
    },
  ],
});

export const diyPageUpdate = defineRoute({
  id: 'diy.adminPageUpdate',
  method: 'PATCH',
  path: '/admin-api/diy/pages/:id',
  auth: 'admin',
  permission: 'diy:page:update',
  summary: '修改装修页面设置',
  tags: ['diy'],
  params: pageParams,
  body: diyPageUpdateBody,
  response: diyPageDetail,
  errors: ['DIY_PAGE_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      params: { id: '1' },
      body: { name: '默认首页', background: { color: '#F5F5F5' } },
      response: diyPageDetailExample,
    },
  ],
});

/**
 * The editor's save. `content` is the renderer's own envelope and is stored
 * byte for byte; the server only validates it, strips the resolved product and
 * article lists the editor hydrated for preview, and bumps the version.
 */
export const diyPageSaveContent = defineRoute({
  id: 'diy.adminPageSaveContent',
  method: 'PUT',
  path: '/admin-api/diy/pages/:id/content',
  auth: 'admin',
  permission: 'diy:page:update',
  summary: '保存装修页面内容',
  tags: ['diy'],
  params: pageParams,
  body: diyPageContentBody,
  response: diyPageDetail,
  errors: [
    'DIY_PAGE_NOT_FOUND',
    'DIY_CONTENT_INVALID',
    'DIY_VERSION_CONFLICT',
    'DIY_COMPONENT_LIMIT_EXCEEDED',
  ],
  examples: [
    {
      name: 'ok',
      params: { id: '1' },
      body: { content: diyPageDetailExample.content, version: '1716451200000' },
      response: diyPageDetailExample,
    },
  ],
});

export const diyPageDelete = defineRoute({
  id: 'diy.adminPageDelete',
  method: 'DELETE',
  path: '/admin-api/diy/pages/:id',
  auth: 'admin',
  permission: 'diy:page:delete',
  summary: '删除装修页面',
  tags: ['diy'],
  params: pageParams,
  response: z.object({ ok: z.literal(true) }),
  errors: ['DIY_PAGE_NOT_FOUND', 'DIY_PAGE_UNDELETABLE'],
  examples: [{ name: 'ok', params: { id: '2' }, response: { ok: true } }],
});

export const diyPagePublish = defineRoute({
  id: 'diy.adminPagePublish',
  method: 'POST',
  path: '/admin-api/diy/pages/:id/publish',
  auth: 'admin',
  permission: 'diy:page:publish',
  summary: '发布装修页面',
  tags: ['diy'],
  params: pageParams,
  response: diyPageDetail,
  errors: ['DIY_PAGE_NOT_FOUND', 'DIY_CONTENT_INVALID'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyPageDetailExample }],
});

/** Make this the page the storefront serves at `/`. */
export const diyPageSetHome = defineRoute({
  id: 'diy.adminPageSetHome',
  method: 'POST',
  path: '/admin-api/diy/pages/:id/home',
  auth: 'admin',
  permission: 'diy:page:publish',
  summary: '设为首页模板',
  tags: ['diy'],
  params: pageParams,
  response: diyPageDetail,
  errors: ['DIY_PAGE_NOT_FOUND', 'DIY_HOME_KIND_MISMATCH'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyPageDetailExample }],
});

export const diyPageCopy = defineRoute({
  id: 'diy.adminPageCopy',
  method: 'POST',
  path: '/admin-api/diy/pages/:id/copy',
  auth: 'admin',
  permission: 'diy:page:create',
  summary: '复制装修页面',
  tags: ['diy'],
  params: pageParams,
  body: diyPageCopyBody,
  response: diyPageDetail,
  status: 201,
  errors: ['DIY_PAGE_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      params: { id: '1' },
      body: { name: '默认首页 副本' },
      response: {
        ...diyPageDetailExample,
        id: '2',
        isHome: false,
        status: 'draft',
        publishedAt: null,
      },
    },
  ],
});

/**
 * The factory copy lives on the active theme (`themes.default_data`, one blob
 * per surface) rather than on each page, so "save as default" writes there and
 * "restore" reads from there. A theme without a copy for 个人中心 or 商品详情
 * restores the built-in page.
 */
export const diyPageRestoreDefault = defineRoute({
  id: 'diy.adminPageRestoreDefault',
  method: 'POST',
  path: '/admin-api/diy/pages/:id/restore-default',
  auth: 'admin',
  permission: 'diy:page:update',
  summary: '还原装修默认数据',
  tags: ['diy'],
  params: pageParams,
  response: diyPageDetail,
  errors: ['DIY_PAGE_NOT_FOUND', 'DIY_NO_DEFAULT_CONTENT'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyPageDetailExample }],
});

export const diyPageSaveDefault = defineRoute({
  id: 'diy.adminPageSaveDefault',
  method: 'POST',
  path: '/admin-api/diy/pages/:id/save-default',
  auth: 'admin',
  permission: 'diy:page:publish',
  summary: '将当前内容设为默认数据',
  tags: ['diy'],
  params: pageParams,
  response: z.object({ ok: z.literal(true) }),
  errors: ['DIY_PAGE_NOT_FOUND', 'DIY_THEME_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: { ok: true } }],
});

// ---------------------------------------------------------------------------
// themes
// ---------------------------------------------------------------------------

export const diyThemeList = defineRoute({
  id: 'diy.adminThemeList',
  method: 'GET',
  path: '/admin-api/diy/themes',
  auth: 'admin',
  permission: 'diy:theme:read',
  summary: '主题列表',
  tags: ['diy'],
  response: z.object({ items: z.array(diyTheme) }),
  examples: [{ name: 'ok', response: { items: [diyThemeExample] } }],
});

export const diyThemeUpdate = defineRoute({
  id: 'diy.adminThemeUpdate',
  method: 'PATCH',
  path: '/admin-api/diy/themes/:id',
  auth: 'admin',
  permission: 'diy:theme:update',
  summary: '修改主题',
  tags: ['diy'],
  params: pageParams,
  body: diyThemeUpdateBody,
  response: diyTheme,
  errors: ['DIY_THEME_NOT_FOUND', 'DIY_THEME_BUILT_IN_READONLY'],
  examples: [
    {
      name: 'ok',
      params: { id: '1' },
      body: { tokens: { theme: '#E93323', accent: '#FF7E00' } },
      response: diyThemeExample,
    },
  ],
});

/** 一键换色 — exactly one theme is active, enforced by `themes_active_uq`. */
export const diyThemeActivate = defineRoute({
  id: 'diy.adminThemeActivate',
  method: 'POST',
  path: '/admin-api/diy/themes/:id/activate',
  auth: 'admin',
  permission: 'diy:theme:update',
  summary: '启用主题',
  tags: ['diy'],
  params: pageParams,
  response: diyTheme,
  errors: ['DIY_THEME_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyThemeExample }],
});

// ---------------------------------------------------------------------------
// link registry
// ---------------------------------------------------------------------------

export const diyLinkCategoryList = defineRoute({
  id: 'diy.adminLinkCategoryList',
  method: 'GET',
  path: '/admin-api/diy/link-categories',
  auth: 'admin',
  permission: 'diy:link:read',
  summary: '页面链接分类',
  tags: ['diy'],
  response: z.object({ items: z.array(diyLinkCategory) }),
  examples: [{ name: 'ok', response: { items: [diyLinkCategoryExample] } }],
});

export const diyLinkList = defineRoute({
  id: 'diy.adminLinkList',
  method: 'GET',
  path: '/admin-api/diy/links',
  auth: 'admin',
  permission: 'diy:link:read',
  summary: '页面链接列表',
  tags: ['diy'],
  query: diyLinkListQuery,
  response: z.object({ items: z.array(diyLink) }),
  examples: [{ name: 'ok', query: {}, response: { items: [diyLinkExample] } }],
});

export const diyLinkCreate = defineRoute({
  id: 'diy.adminLinkCreate',
  method: 'POST',
  path: '/admin-api/diy/links',
  auth: 'admin',
  permission: 'diy:link:update',
  summary: '新增页面链接',
  tags: ['diy'],
  body: diyLinkBody,
  response: diyLink,
  status: 201,
  errors: ['DIY_LINK_URL_EXISTS', 'DIY_LINK_CATEGORY_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      body: {
        name: '商品详情',
        url: '/pages/goods_details/index',
        paramName: 'id',
        categoryId: '1',
      },
      response: diyLinkExample,
    },
  ],
});

export const diyLinkUpdate = defineRoute({
  id: 'diy.adminLinkUpdate',
  method: 'PATCH',
  path: '/admin-api/diy/links/:id',
  auth: 'admin',
  permission: 'diy:link:update',
  summary: '修改页面链接',
  tags: ['diy'],
  params: pageParams,
  body: diyLinkBody.partial(),
  response: diyLink,
  errors: ['DIY_LINK_NOT_FOUND', 'DIY_LINK_URL_EXISTS', 'DIY_LINK_CATEGORY_NOT_FOUND'],
  examples: [
    { name: 'ok', params: { id: '1' }, body: { name: '商品详情页' }, response: diyLinkExample },
  ],
});

export const diyLinkDelete = defineRoute({
  id: 'diy.adminLinkDelete',
  method: 'DELETE',
  path: '/admin-api/diy/links/:id',
  auth: 'admin',
  permission: 'diy:link:update',
  summary: '删除页面链接',
  tags: ['diy'],
  params: pageParams,
  response: z.object({ ok: z.literal(true) }),
  errors: ['DIY_LINK_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: { ok: true } }],
});
