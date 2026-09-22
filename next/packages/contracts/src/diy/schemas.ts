import { z } from 'zod';

import { id, instant } from '../_conventions/common';
import { diyPageBackground, diyPageKind, diyPageStatus } from './schema/page';

/**
 * Wire shapes for the 装修 domain.
 *
 * One rule governs everything here: **the saved page envelope crosses the wire
 * untouched**. `content` is typed as a bare record of unknowns, never as
 * `diyPageValue`, because `handle()` runs the declared schema over every body
 * and response and the component schemas are loose objects — zod would rebuild
 * them with the declared keys first and silently reorder the JSON. A record of
 * `z.unknown()` copies keys in input order and passes the values by identity,
 * so the bytes survive. Validation against the real component schemas happens
 * in `core/diy`, through `parseDiyPageValue`, which hands back its input.
 */
export const diyContent = z.record(z.string(), z.unknown());
export type DiyContent = z.infer<typeof diyContent>;

export { diyPageBackground, diyPageKind, diyPageStatus };

/**
 * Optimistic-concurrency token. Derived from the row's `updated_at`, so it
 * changes on every write and needs no column of its own. The editor sends back
 * the one it loaded; a mismatch is `DIY_VERSION_CONFLICT` rather than a silent
 * overwrite. It doubles as the storefront's cache validator (`ETag`), which is
 * what the legacy `get_diy_version` endpoint existed for.
 */
export const diyVersion = z.string().min(1).max(64);

export const diyPageSummary = z.object({
  id,
  name: z.string(),
  kind: diyPageKind,
  title: z.string().nullable(),
  status: diyPageStatus,
  isHome: z.boolean(),
  /** How many components the page holds. Cheap, and the list column shows it. */
  componentCount: z.number().int().min(0),
  version: diyVersion,
  publishedAt: instant.nullable(),
  createdAt: instant,
  updatedAt: instant,
});
export type DiyPageSummary = z.infer<typeof diyPageSummary>;

export const diyPageDetail = diyPageSummary.extend({
  content: diyContent,
  schemaVersion: z.number().int().min(1),
  background: diyPageBackground.nullable(),
});
export type DiyPageDetail = z.infer<typeof diyPageDetail>;

export const diyPageListQuery = z.object({
  kind: diyPageKind.optional(),
  status: diyPageStatus.optional(),
  /** Matches `name` and `title`, case-insensitively. */
  keyword: z.string().max(100).optional(),
});

export const diyPageCreateBody = z.object({
  name: z.string().min(1).max(100),
  kind: diyPageKind.default('micro'),
  title: z.string().max(100).nullish(),
});
export type DiyPageCreateBody = z.infer<typeof diyPageCreateBody>;

/** Page settings. Content is saved through its own route so a rename is cheap. */
export const diyPageUpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  title: z.string().max(100).nullish(),
  background: diyPageBackground.nullish(),
});
export type DiyPageUpdateBody = z.infer<typeof diyPageUpdateBody>;

export const diyPageContentBody = z.object({
  content: diyContent,
  /**
   * The version the editor loaded. Omitted only by tooling that knowingly
   * overwrites (the ETL, a seed); the editor always sends it.
   */
  version: diyVersion.optional(),
  /** Publish in the same round trip, so "保存并发布" is one request. */
  publish: z.boolean().optional(),
});
export type DiyPageContentBody = z.infer<typeof diyPageContentBody>;

export const diyPageCopyBody = z.object({
  name: z.string().min(1).max(100).optional(),
});

// ---------------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------------

/**
 * What the uni-app renderer reads. Deliberately not the admin detail: no
 * draft, no counts, and `content` has already been through the removed-component
 * and removed-link filter.
 */
export const diyStorefrontPage = z.object({
  id,
  name: z.string(),
  kind: diyPageKind,
  title: z.string().nullable(),
  content: diyContent,
  schemaVersion: z.number().int().min(1),
  background: diyPageBackground.nullable(),
  version: diyVersion,
});
export type DiyStorefrontPage = z.infer<typeof diyStorefrontPage>;

/**
 * 底部导航 — the decorated tab bar (CR-3-h2 §2).
 *
 * `navigation` is the saved `pageFoot` component **verbatim**, not a re-shaped
 * `{ enabled, items }`. `components/pageFooter/index.vue` reads
 * `effectConfig.tabVal`, `navStyleConfig.tabVal`, `menuList[].imgList`,
 * `bgColor2.color[0].item`, `fillet.valList[3].val` and a dozen more off the
 * object it is handed; a tidier shape would be a rewrite of that renderer, and
 * the rule of this domain is that the saved envelope crosses the wire untouched.
 *
 * `null` when the live home page carries no 底部导航. That is a real and common
 * state — the shop uses the native tab bar — so it is not a 404.
 */
export const diyNavigation = z.object({
  navigation: diyContent.nullable(),
  version: diyVersion,
});
export type DiyNavigation = z.infer<typeof diyNavigation>;

/**
 * 版式 — which built-in layout 分类页 / 个人中心 use (CR-3-h2 §3).
 *
 * A number, not a boolean: `pages/goods_cate/goods_cate.vue` tests
 * `status == 2 || status == 3`, and the production fixtures carry
 * `category: 1` and `member: 2`. The CR's `{ status: boolean }` would have
 * collapsed two of the three values into one.
 */
export const diyLayoutType = z.enum(['category', 'user']);
export type DiyLayoutType = z.infer<typeof diyLayoutType>;

export const diyLayout = z.object({
  status: z.number().int().min(1).max(3),
});
export type DiyLayout = z.infer<typeof diyLayout>;

export const diyThemeTokens = z.record(z.string(), z.unknown());

export const diyStorefrontTheme = z.object({
  id,
  name: z.string(),
  tokens: diyThemeTokens,
  version: diyVersion,
});
export type DiyStorefrontTheme = z.infer<typeof diyStorefrontTheme>;

// ---------------------------------------------------------------------------
// themes
// ---------------------------------------------------------------------------

export const diyThemeKind = z.enum(['built_in', 'custom']);

export const diyTheme = z.object({
  id,
  name: z.string(),
  intro: z.string().nullable(),
  kind: diyThemeKind,
  isActive: z.boolean(),
  tokens: diyThemeTokens,
  previewImages: z.record(z.string(), z.string()).nullable(),
  version: diyVersion,
  updatedAt: instant,
});
export type DiyTheme = z.infer<typeof diyTheme>;

export const diyThemeUpdateBody = z.object({
  name: z.string().min(1).max(100).optional(),
  intro: z.string().max(255).nullish(),
  tokens: diyThemeTokens.optional(),
});

// ---------------------------------------------------------------------------
// link registry
// ---------------------------------------------------------------------------

/**
 * A storefront route an operator may point a component at. This is the data
 * behind `<LinkPicker>` and behind `DiyLinkField`; a component stores the
 * resolved path string, never the link id, because that is what the renderer
 * navigates to.
 */
export const diyLink = z.object({
  id,
  categoryId: id.nullable(),
  name: z.string(),
  url: z.string(),
  paramName: z.string().nullable(),
  example: z.string().nullable(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int(),
});
export type DiyLink = z.infer<typeof diyLink>;

export const diyLinkCategory = z.object({
  id,
  parentId: id.nullable(),
  name: z.string(),
  isEnabled: z.boolean(),
  sortOrder: z.number().int(),
});
export type DiyLinkCategory = z.infer<typeof diyLinkCategory>;

export const diyLinkListQuery = z.object({
  categoryId: id.optional(),
  keyword: z.string().max(100).optional(),
  /** Admin screens want the disabled ones too; the picker never does. */
  includeDisabled: z.stringbool().optional(),
});

export const diyLinkBody = z.object({
  categoryId: id.nullish(),
  name: z.string().min(1).max(64),
  url: z.string().min(1).max(255),
  paramName: z.string().max(64).nullish(),
  example: z.string().max(255).nullish(),
  isEnabled: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type DiyLinkBody = z.infer<typeof diyLinkBody>;

// ---------------------------------------------------------------------------
// examples
// ---------------------------------------------------------------------------

/** One real component, so the mock server serves something the editor can render. */
export const diyExampleContent: DiyContent = {
  '1716451200000': {
    name: 'titles',
    cname: '标题',
    timestamp: 1716451200000,
    setUp: { tabVal: 0 },
    titleConfig: { title: '标题内容', val: '为你推荐' },
  },
};

export const diyPageSummaryExample: DiyPageSummary = {
  id: '1',
  name: '默认首页',
  kind: 'home',
  title: '商城首页',
  status: 'published',
  isHome: true,
  componentCount: 1,
  version: '1716451200000',
  publishedAt: '2024-05-23T14:00:00+08:00',
  createdAt: '2024-05-23T14:00:00+08:00',
  updatedAt: '2024-05-23T14:00:00+08:00',
};

export const diyPageDetailExample: DiyPageDetail = {
  ...diyPageSummaryExample,
  content: diyExampleContent,
  schemaVersion: 1,
  background: { color: '#F5F5F5' },
};

export const diyStorefrontPageExample: DiyStorefrontPage = {
  id: '1',
  name: '默认首页',
  kind: 'home',
  title: '商城首页',
  content: diyExampleContent,
  schemaVersion: 1,
  background: { color: '#F5F5F5' },
  version: '1716451200000',
};

export const diyThemeExample: DiyTheme = {
  id: '1',
  name: '默认主题',
  intro: '系统内置',
  kind: 'built_in',
  isActive: true,
  tokens: { theme: '#E93323', accent: '#FF7E00' },
  previewImages: null,
  version: '1716451200000',
  updatedAt: '2024-05-23T14:00:00+08:00',
};

export const diyLinkExample: DiyLink = {
  id: '1',
  categoryId: '1',
  name: '商品详情',
  url: '/pages/goods_details/index',
  paramName: 'id',
  example: '/pages/goods_details/index?id=1',
  isEnabled: true,
  sortOrder: 0,
};

export const diyLinkCategoryExample: DiyLinkCategory = {
  id: '1',
  parentId: null,
  name: '商品',
  isEnabled: true,
  sortOrder: 0,
};
