/**
 * 页面装修 — the legacy decoration tables → the new DIY schema.
 *
 * Sources (`crmeb/public/install/crmeb.sql`):
 *
 * | Legacy              | New                     |
 * | ------------------- | ----------------------- |
 * | `eb_diy`            | `diy_pages`             |
 * | `eb_theme`          | `themes`                |
 * | `eb_page_categroy`  | `page_link_categories`  |
 * | `eb_page_link`      | `page_links`            |
 *
 * A pure function: rows in, rows and a report out. Nothing here opens a
 * connection or looks at a clock, so the test beside it runs on literal rows
 * copied out of the legacy dump.
 *
 * **The page payload is copied byte for byte.** `content` is the envelope the
 * uni-app renderer already understands, and the whole stream rests on it
 * surviving unchanged (`invariants.md` DIY-001). The mapper therefore never
 * reformats, re-keys, sorts or prunes it — not even the components this build
 * has retired, which are stripped on *read* by `cleanDiyData` so that a page
 * whose component comes back is whole again (DIY-002).
 *
 * Two legacy tables are deliberately NOT read:
 *
 *  - `eb_theme_download` — the theme marketplace, which is out of scope;
 *  - `eb_diy.default_value` — the "restore default" payload, which the new
 *    system takes from `themes.default_data` for the surface instead (see
 *    `docs/rewrite/status/g1.md`). It is reported, never migrated.
 */

// ---------------------------------------------------------------------------
// legacy row shapes
// ---------------------------------------------------------------------------

/**
 * `eb_diy`. `value` is a longtext holding JSON; the runner may hand it over
 * already parsed, so both are accepted. Timestamps are unix seconds.
 */
export interface LegacyDiy {
  id: number;
  /** A per-save hash (`67c8fdd330dca`), not a schema version. Dropped. */
  version: string;
  name: string;
  /** '' for a visual page; `color_change` / `category` / `member` for a settings row. */
  template_name: string;
  value: unknown;
  default_value: unknown;
  add_time: number;
  update_time: number;
  /** 1 = the template the storefront is serving (`DiyServices::setStatus`). */
  status: number;
  /** 0 可视化, 2 微页面. Every row in the reference dump is `1`. */
  type: number;
  is_show: number;
  is_bg_color: number;
  is_bg_pic: number;
  color_picker: string;
  bg_pic: string;
  /** Index into `('full', 'repeat', 'fixed')`. */
  bg_tab_val: number;
  is_del: number;
  /** 0 = a pre-visual-editor row whose `value` is a bare number, not a page. */
  is_diy: number;
  title: string;
}

/** `eb_theme`. The `*_data` columns hold the same envelope as `eb_diy.value`. */
export interface LegacyTheme {
  id: number;
  title: string;
  info: string;
  /** 0 自建主题, 1 广场主题. */
  type: number;
  home_data: unknown;
  home_image: string;
  category_data: unknown;
  category_image: string;
  detail_data: unknown;
  detail_image: string;
  user_data: unknown;
  user_image: string;
  theme_data: unknown;
  home_default_data: unknown;
  category_default_data: unknown;
  detail_default_data: unknown;
  user_default_data: unknown;
  theme_default_data: unknown;
  /** `theme` or `micro`. */
  page_type: string;
  is_use: number;
  is_del: number;
  add_time: number;
  up_time: number;
}

/** `eb_page_categroy` — note the legacy spelling. */
export interface LegacyPageCategory {
  id: number;
  pid: number;
  /** `link` groups hold static routes; everything else is a dynamic picker. */
  type: string;
  name: string;
  sort: number;
  status: number;
  add_time: number;
}

/** `eb_page_link`. */
export interface LegacyPageLink {
  id: number;
  cate_id: number;
  type: number;
  name: string;
  url: string;
  param: string;
  example: string;
  status: number;
  sort: number;
  add_time: number;
}

// ---------------------------------------------------------------------------
// output row shapes (a subset of the Drizzle insert types, by hand so that
// `@shop/etl` does not depend on `@shop/db` before the runner exists)
// ---------------------------------------------------------------------------

export type DiyPageKind = 'home' | 'category' | 'product_detail' | 'user_center' | 'micro';
export type DiyPageStatus = 'draft' | 'published';
export type ThemeKind = 'built_in' | 'custom';

export interface DiyPageBackgroundRow {
  color?: string;
  imageUrl?: string;
  imageMode?: 'full' | 'repeat' | 'fixed';
}

export interface DiyPageRow {
  id: number;
  name: string;
  kind: DiyPageKind;
  title: string | null;
  status: DiyPageStatus;
  isHome: boolean;
  content: Record<string, unknown>;
  schemaVersion: number;
  background: DiyPageBackgroundRow | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface ThemeDataRow {
  home?: Record<string, unknown>;
  category?: Record<string, unknown>;
  productDetail?: Record<string, unknown>;
  userCenter?: Record<string, unknown>;
  tokens?: Record<string, unknown>;
}

export interface ThemeRow {
  id: number;
  name: string;
  intro: string | null;
  kind: ThemeKind;
  isActive: boolean;
  data: ThemeDataRow;
  defaultData: ThemeDataRow | null;
  schemaVersion: number;
  previewImages: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PageLinkCategoryRow {
  id: number;
  parentId: number | null;
  name: string;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PageLinkRow {
  id: number;
  categoryId: number | null;
  name: string;
  url: string;
  paramName: string | null;
  example: string | null;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A row that was not migrated, named so a human can check it off. The table is
 * part of it because the four legacy tables number their rows independently —
 * `eb_diy` #2 is 一键换色 and `eb_page_categroy` #2 is the DIY页面 group.
 */
export interface DroppedRow {
  table: 'eb_diy' | 'eb_theme' | 'eb_page_categroy' | 'eb_page_link';
  id: number;
  name: string;
  reason: string;
}

/**
 * The three settings rows the legacy editor kept in `eb_diy` beside the pages.
 * Their `value` is a bare number — the index of the built-in layout the
 * operator picked — so they are not pages and cannot become `diy_pages` rows.
 * They are reported rather than dropped silently.
 *
 * Two of the three now have a home and an ETL path: `category` and `member`
 * are `diy.categoryLayout` / `diy.userCenterLayout` in the config registry
 * (`core/src/diy/diy.config.ts`), and the **config** group carries them into
 * `config_values` through `DIY_LAYOUT_FIELDS` below. `color_change` has none —
 * 一键换色 is not ported — so it stays a reported number and nothing else.
 */
export interface LegacyDiySettings {
  /** `color_change` — index into the legacy 一键换色 palette. Not ported. */
  themeColourIndex: number | null;
  /** `category` — which built-in 分类页 layout is in use. `diy.categoryLayout`. */
  categoryLayout: number | null;
  /** `member` — which built-in 个人中心 layout is in use. `diy.userCenterLayout`. */
  userCenterLayout: number | null;
}

/** The two settings the `diy` config group has a field for. */
export type DiyLayoutField = 'categoryLayout' | 'userCenterLayout';

/**
 * `eb_diy.template_name` → the field of the `diy` config group it becomes, or
 * `undefined` for a settings row with no new home (`color_change`, and the
 * `product_detail` template row a shop may also carry).
 *
 * The one place the correspondence is written down: this mapper calls it to
 * fill `report.settings`, and `config.ts` calls it to stage the same two
 * numbers as `config_values` rows. Two copies of "`member` means 个人中心" is
 * how one of them ends up carrying a value the other does not.
 */
export function diyLayoutField(templateName: string): DiyLayoutField | undefined {
  if (templateName === 'category') return 'categoryLayout';
  if (templateName === 'member') return 'userCenterLayout';
  return undefined;
}

/** The `eb_diy` columns the config group reads. A subset of `LegacyDiy`. */
export type LegacyDiyLayoutRow = Pick<LegacyDiy, 'template_name' | 'value'>;

export interface DiyMigrationReport {
  pages: number;
  pagesDroppedDeleted: number;
  /** `template_name` rows: settings, not pages. Their values are in `settings`. */
  pagesDroppedSettingsRow: number;
  /** `value` was null, a bare number, or unparseable JSON. */
  pagesDroppedNoContent: number;
  /** Legacy allowed several `status = 1` rows; the new unique index does not. */
  extraHomeFlagsCleared: number;
  /** `eb_diy.default_value` payloads that held a page and were not migrated. */
  defaultValuesNotMigrated: number;
  themes: number;
  themesDroppedDeleted: number;
  /** `page_type = 'micro'` — 微页面 beyond `diy_pages.kind`, out of scope. */
  themesDroppedMicro: number;
  extraActiveThemesCleared: number;
  linkCategories: number;
  /** Groups the legacy picker filled from a query (商品, 文章, DIY页面, …). */
  linkCategoriesDroppedDynamic: number;
  /** A kept category whose parent was dropped becomes a root. */
  categoriesDetachedFromDroppedParent: number;
  links: number;
  /** `page_links_url_uq`: the legacy table allows the same url twice. */
  linksDroppedDuplicateUrl: number;
  linksDetachedFromDroppedCategory: number;
  settings: LegacyDiySettings;
  dropped: DroppedRow[];
}

export interface DiyMigrationInput {
  diy?: readonly LegacyDiy[];
  themes?: readonly LegacyTheme[];
  linkCategories?: readonly LegacyPageCategory[];
  links?: readonly LegacyPageLink[];
}

export interface DiyMigrationOutput {
  pages: DiyPageRow[];
  themes: ThemeRow[];
  linkCategories: PageLinkCategoryRow[];
  links: PageLinkRow[];
  report: DiyMigrationReport;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Unix seconds → `Date`. `0` is the legacy "unset" sentinel. */
function at(seconds: number | undefined, fallback: Date): Date {
  return seconds && seconds > 0 ? new Date(seconds * 1000) : fallback;
}

/**
 * A longtext column holding JSON, or an already-parsed value. Returns `null`
 * for anything that is not a JSON object — including the bare numbers the
 * settings rows store and the `""` / `"[]"` an empty column holds.
 */
function jsonObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    return Array.isArray(value) ? null : (value as Record<string, unknown>);
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (text === '' || text === 'null') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The bare number a settings row keeps in `value`.
 *
 * Exported because `config.ts` reads the same two rows out of `eb_diy` and has
 * to read them the same way — the column is a longtext, so a dump hands the
 * number over as `'2'` while an already-parsed row hands over `2`. Anything
 * that is not a finite number (including the page JSON a `product_detail`
 * settings row holds) is `null`, which means "this row says nothing".
 */
export function settingNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

const BG_MODES = ['full', 'repeat', 'fixed'] as const;

/**
 * `eb_diy` background columns → `diy_pages.background`.
 *
 * The flags gate the values, exactly as the renderer reads them
 * (`template/uni-app/pages/index/index.vue:647`): every page in the reference
 * dump carries `color_picker = '#f5f5f5'` with `is_bg_color = 0`, and shows no
 * background colour. Copying the colour anyway would repaint them all.
 */
function backgroundOf(row: LegacyDiy): DiyPageBackgroundRow | null {
  const background: DiyPageBackgroundRow = {};
  if (row.is_bg_color === 1 && row.color_picker !== '') background.color = row.color_picker;
  if (row.is_bg_pic === 1 && row.bg_pic !== '') {
    background.imageUrl = row.bg_pic;
    background.imageMode = BG_MODES[row.bg_tab_val] ?? 'full';
  }
  return Object.keys(background).length > 0 ? background : null;
}

/**
 * Which surface a visual page decorates.
 *
 * `template_name` names the three settings rows and is empty for every page.
 * `type` is the only other discriminator the legacy list has
 * (`DiyServices::getDiyList`: `2` is a 微页面), and it is `1` on all six rows of
 * the reference dump — including the settings rows — so anything that is not
 * explicitly a 微页面 is a home template, which is what the legacy list shows.
 */
function kindOf(row: LegacyDiy): DiyPageKind {
  return row.type === 2 ? 'micro' : 'home';
}

// ---------------------------------------------------------------------------
// the mapper
// ---------------------------------------------------------------------------

export function mapDiy(input: DiyMigrationInput): DiyMigrationOutput {
  const report: DiyMigrationReport = {
    pages: 0,
    pagesDroppedDeleted: 0,
    pagesDroppedSettingsRow: 0,
    pagesDroppedNoContent: 0,
    extraHomeFlagsCleared: 0,
    defaultValuesNotMigrated: 0,
    themes: 0,
    themesDroppedDeleted: 0,
    themesDroppedMicro: 0,
    extraActiveThemesCleared: 0,
    linkCategories: 0,
    linkCategoriesDroppedDynamic: 0,
    categoriesDetachedFromDroppedParent: 0,
    links: 0,
    linksDroppedDuplicateUrl: 0,
    linksDetachedFromDroppedCategory: 0,
    settings: { themeColourIndex: null, categoryLayout: null, userCenterLayout: null },
    dropped: [],
  };

  const pages = mapPages(input.diy ?? [], report);
  const themes = mapThemes(input.themes ?? [], report);
  const { categories, keptCategoryIds } = mapLinkCategories(input.linkCategories ?? [], report);
  const links = mapLinks(input.links ?? [], keptCategoryIds, report);

  return { pages, themes, linkCategories: categories, links, report };
}

function mapPages(rows: readonly LegacyDiy[], report: DiyMigrationReport): DiyPageRow[] {
  const pages: DiyPageRow[] = [];

  for (const row of rows) {
    if (row.is_del === 1) {
      report.pagesDroppedDeleted += 1;
      report.dropped.push({
        table: 'eb_diy',
        id: row.id,
        name: row.name,
        reason: 'eb_diy.is_del = 1',
      });
      continue;
    }

    if (row.template_name !== '') {
      report.pagesDroppedSettingsRow += 1;
      const picked = settingNumber(row.value);
      const field: keyof LegacyDiySettings | undefined =
        row.template_name === 'color_change'
          ? 'themeColourIndex'
          : diyLayoutField(row.template_name);
      if (field !== undefined) report.settings[field] = picked;
      report.dropped.push({
        table: 'eb_diy',
        id: row.id,
        name: row.name,
        reason: `settings row template_name = '${row.template_name}', value = ${String(picked)}`,
      });
      continue;
    }

    const content = jsonObject(row.value);
    if (content === null) {
      report.pagesDroppedNoContent += 1;
      report.dropped.push({
        table: 'eb_diy',
        id: row.id,
        name: row.name,
        reason: 'eb_diy.value holds no page',
      });
      continue;
    }

    if (jsonObject(row.default_value) !== null) report.defaultValuesNotMigrated += 1;

    const createdAt = at(row.add_time, new Date(0));
    const updatedAt = at(row.update_time, createdAt);
    const published = row.status === 1;

    pages.push({
      id: row.id,
      name: row.name === '' ? `未命名页面 ${row.id}` : row.name,
      kind: kindOf(row),
      title: row.title === '' ? null : row.title,
      status: published ? 'published' : 'draft',
      isHome: published,
      content,
      schemaVersion: 1,
      background: backgroundOf(row),
      publishedAt: published ? updatedAt : null,
      createdAt,
      updatedAt,
      deletedAt: null,
    });
  }

  // `diy_pages_home_uq` allows one home page; legacy `setStatus` clears the
  // others, but a dump taken mid-migration (or hand-edited) can hold several.
  // The most recently updated wins, and the rest stay published-but-not-home.
  const homes = pages.filter((page) => page.isHome);
  if (homes.length > 1) {
    const winner = homes.reduce((best, page) =>
      page.updatedAt.getTime() >= best.updatedAt.getTime() ? page : best,
    );
    for (const page of homes) {
      if (page === winner) continue;
      page.isHome = false;
      report.extraHomeFlagsCleared += 1;
      report.dropped.push({
        table: 'eb_diy',
        id: page.id,
        name: page.name,
        reason: 'another eb_diy row also had status = 1; kept as a published draft',
      });
    }
  }

  // A 微页面 may not carry the home flag (`diy_pages_home_is_home_kind`).
  for (const page of pages) {
    if (page.isHome && page.kind !== 'home') {
      page.isHome = false;
      report.extraHomeFlagsCleared += 1;
      report.dropped.push({
        table: 'eb_diy',
        id: page.id,
        name: page.name,
        reason: `status = 1 on a ${page.kind} page; only a home page may be the home page`,
      });
    }
  }

  report.pages = pages.length;
  return pages;
}

function themeDataOf(
  row: LegacyTheme,
  columns: readonly [unknown, unknown, unknown, unknown, unknown],
): ThemeDataRow {
  const [home, category, detail, user, tokens] = columns;
  const data: ThemeDataRow = {};
  const homeData = jsonObject(home);
  if (homeData) data.home = homeData;
  const categoryData = jsonObject(category);
  if (categoryData) data.category = categoryData;
  const detailData = jsonObject(detail);
  if (detailData) data.productDetail = detailData;
  const userData = jsonObject(user);
  if (userData) data.userCenter = userData;
  const tokenData = jsonObject(tokens);
  if (tokenData) data.tokens = tokenData;
  return data;
}

function mapThemes(rows: readonly LegacyTheme[], report: DiyMigrationReport): ThemeRow[] {
  const themes: ThemeRow[] = [];

  for (const row of rows) {
    if (row.is_del === 1) {
      report.themesDroppedDeleted += 1;
      report.dropped.push({
        table: 'eb_theme',
        id: row.id,
        name: row.title,
        reason: 'eb_theme.is_del = 1',
      });
      continue;
    }
    if (row.page_type === 'micro') {
      report.themesDroppedMicro += 1;
      report.dropped.push({
        table: 'eb_theme',
        id: row.id,
        name: row.title,
        reason: "eb_theme.page_type = 'micro' — 微页面 are out of scope",
      });
      continue;
    }

    const createdAt = at(row.add_time, new Date(0));
    const previews: Record<string, string> = {};
    if (row.home_image !== '') previews['home'] = row.home_image;
    if (row.category_image !== '') previews['category'] = row.category_image;
    if (row.detail_image !== '') previews['productDetail'] = row.detail_image;
    if (row.user_image !== '') previews['userCenter'] = row.user_image;

    const defaultData = themeDataOf(row, [
      row.home_default_data,
      row.category_default_data,
      row.detail_default_data,
      row.user_default_data,
      row.theme_default_data,
    ]);

    themes.push({
      id: row.id,
      name: row.title === '' ? `主题 ${row.id}` : row.title,
      intro: row.info === '' ? null : row.info,
      // 广场主题 arrive whole from the marketplace and are not edited here, so
      // they migrate as `built_in`: the new schema refuses to change those
      // (`DIY_THEME_BUILT_IN_READONLY`), which is the legacy behaviour.
      kind: row.type === 1 ? 'built_in' : 'custom',
      isActive: row.is_use === 1,
      data: themeDataOf(row, [
        row.home_data,
        row.category_data,
        row.detail_data,
        row.user_data,
        row.theme_data,
      ]),
      defaultData: Object.keys(defaultData).length > 0 ? defaultData : null,
      schemaVersion: 1,
      previewImages: Object.keys(previews).length > 0 ? previews : null,
      createdAt,
      updatedAt: at(row.up_time, createdAt),
      deletedAt: null,
    });
  }

  const active = themes.filter((theme) => theme.isActive);
  if (active.length > 1) {
    const winner = active.reduce((best, theme) =>
      theme.updatedAt.getTime() >= best.updatedAt.getTime() ? theme : best,
    );
    for (const theme of active) {
      if (theme === winner) continue;
      theme.isActive = false;
      report.extraActiveThemesCleared += 1;
      report.dropped.push({
        table: 'eb_theme',
        id: theme.id,
        name: theme.name,
        reason: 'another eb_theme row also had is_use = 1',
      });
    }
  }

  report.themes = themes.length;
  return themes;
}

/**
 * The legacy picker groups static routes and dynamic lists in one tree: 商城链接
 * holds urls, 商品 / 文章 / DIY页面 hold whatever a query returns. Only the
 * static groups become `page_link_categories`; the dynamic ones are the
 * `listTargets` half of `DiyLinkSource`, which is served by the owning domain
 * rather than by a registry row.
 */
function mapLinkCategories(
  rows: readonly LegacyPageCategory[],
  report: DiyMigrationReport,
): { categories: PageLinkCategoryRow[]; keptCategoryIds: Set<number> } {
  const kept = new Set<number>();
  for (const row of rows) if (row.type === 'link') kept.add(row.id);

  const categories: PageLinkCategoryRow[] = [];
  for (const row of rows) {
    if (!kept.has(row.id)) {
      report.linkCategoriesDroppedDynamic += 1;
      report.dropped.push({
        table: 'eb_page_categroy',
        id: row.id,
        name: row.name,
        reason: `eb_page_categroy.type = '${row.type}' — a dynamic picker, not a static link group`,
      });
      continue;
    }

    let parentId: number | null = row.pid === 0 ? null : row.pid;
    if (parentId !== null && !kept.has(parentId)) {
      parentId = null;
      report.categoriesDetachedFromDroppedParent += 1;
      report.dropped.push({
        table: 'eb_page_categroy',
        id: row.id,
        name: row.name,
        reason: `parent ${row.pid} was not migrated; kept as a root category`,
      });
    }

    const createdAt = at(row.add_time, new Date(0));
    categories.push({
      id: row.id,
      parentId,
      name: row.name,
      isEnabled: row.status === 1,
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
    });
  }

  report.linkCategories = categories.length;
  return { categories, keptCategoryIds: kept };
}

/**
 * `page_links_url_uq` is new: the legacy table happily holds the same route
 * twice under two names (`/pages/goods/order_list/index` is both 我的订单 and
 * 订单中心 in the reference dump). The first by sort order then id wins, and
 * every loser is named in the report — an operator who wanted both labels adds
 * a query parameter to one of them.
 */
function mapLinks(
  rows: readonly LegacyPageLink[],
  keptCategoryIds: ReadonlySet<number>,
  report: DiyMigrationReport,
): PageLinkRow[] {
  const ordered = [...rows].sort((a, b) => b.sort - a.sort || a.id - b.id);
  const seen = new Map<string, LegacyPageLink>();
  const links: PageLinkRow[] = [];

  for (const row of ordered) {
    const winner = seen.get(row.url);
    if (winner) {
      report.linksDroppedDuplicateUrl += 1;
      report.dropped.push({
        table: 'eb_page_link',
        id: row.id,
        name: row.name,
        reason: `duplicate url ${row.url}, already migrated as #${winner.id} ${winner.name}`,
      });
      continue;
    }
    seen.set(row.url, row);

    let categoryId: number | null = row.cate_id === 0 ? null : row.cate_id;
    if (categoryId !== null && !keptCategoryIds.has(categoryId)) {
      categoryId = null;
      report.linksDetachedFromDroppedCategory += 1;
      report.dropped.push({
        table: 'eb_page_link',
        id: row.id,
        name: row.name,
        reason: `category ${row.cate_id} was not migrated; kept without a category`,
      });
    }

    const createdAt = at(row.add_time, new Date(0));
    links.push({
      id: row.id,
      categoryId,
      name: row.name,
      url: row.url,
      paramName: row.param === '' ? null : row.param,
      example: row.example === '' ? null : row.example,
      isEnabled: row.status === 1,
      sortOrder: row.sort,
      createdAt,
      updatedAt: createdAt,
    });
  }

  links.sort((a, b) => a.id - b.id);
  report.links = links.length;
  return links;
}
