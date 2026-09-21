import { describe, expect, it } from 'vitest';

import {
  mapDiy,
  type LegacyDiy,
  type LegacyPageCategory,
  type LegacyPageLink,
  type LegacyTheme,
} from './diy';

/**
 * The mapper against literal legacy rows.
 *
 * Everything below is copied out of `crmeb/public/install/crmeb.sql`: the six
 * `eb_diy` rows (line 234), the `eb_page_categroy` tree (line 27229) and a slice
 * of the 43 `eb_page_link` rows (line 27281) — including the two that share a
 * url, which is the one thing the new unique index refuses. A migration test
 * with invented input proves nothing.
 */

function diy(overrides: Partial<LegacyDiy> & { id: number }): LegacyDiy {
  return {
    version: '1.0',
    name: '',
    template_name: '',
    value: null,
    default_value: null,
    add_time: 1594949966,
    update_time: 1642256550,
    status: 0,
    type: 1,
    is_show: 0,
    is_bg_color: 0,
    is_bg_pic: 0,
    color_picker: '',
    bg_pic: '',
    bg_tab_val: 0,
    is_del: 0,
    is_diy: 1,
    title: '',
    ...overrides,
  };
}

/** A minimal but real page envelope: one node, keyed by its own timestamp. */
const HOME_VALUE = {
  '1740448022001': {
    name: 'headerSerch',
    timestamp: 1740448022001,
    cname: '搜索框',
    setUp: { tabVal: 0 },
  },
  '1740448022002': { name: 'pageFoot', cname: '底部导航', id: 'idundefined' },
};

const seedDiy: LegacyDiy[] = [
  // (2, '1.0', '一键换色', 'color_change', '1', …)
  diy({ id: 2, name: '一键换色', template_name: 'color_change', value: '1', is_diy: 0 }),
  // (3, '1.0', '分类页选择', 'category', '2', …)
  diy({ id: 3, name: '分类页选择', template_name: 'category', value: '2', is_diy: 0 }),
  // (4, '1.0', '个人中心', 'member', '1', …)
  diy({ id: 4, name: '个人中心', template_name: 'member', value: '1', is_diy: 0 }),
  // (6, '67bd313ce57d7', '首页', '', '{…}', '[]', 1740448022, 1740452156, 0, 1, …)
  diy({
    id: 6,
    version: '67bd313ce57d7',
    name: '首页',
    value: JSON.stringify(HOME_VALUE),
    default_value: '[]',
    add_time: 1740448022,
    update_time: 1740452156,
    status: 0,
    is_show: 1,
    color_picker: '#f5f5f5',
    title: '首页',
  }),
  // (7, '67bd2ea402a47', '模板', '', '{…}', '[]', 1740450786, 1740451492, 0, 1, …)
  diy({
    id: 7,
    version: '67bd2ea402a47',
    name: '模板',
    value: JSON.stringify(HOME_VALUE),
    default_value: '[]',
    add_time: 1740450786,
    update_time: 1740451492,
    status: 0,
    is_show: 1,
    color_picker: '#f5f5f5',
    title: '首页',
  }),
  // (8, '67c8fdd330dca', '首页', '', '{…}', '[]', 1741225025, 1741225427, 1, 1, …)
  diy({
    id: 8,
    version: '67c8fdd330dca',
    name: '首页',
    value: JSON.stringify(HOME_VALUE),
    default_value: '[]',
    add_time: 1741225025,
    update_time: 1741225427,
    status: 1,
    is_show: 1,
    color_picker: '#f5f5f5',
    title: '首页',
  }),
];

function category(overrides: Partial<LegacyPageCategory> & { id: number }): LegacyPageCategory {
  return {
    pid: 0,
    type: 'link',
    name: '',
    sort: 100,
    status: 1,
    add_time: 1626831994,
    ...overrides,
  };
}

const seedCategories: LegacyPageCategory[] = [
  category({ id: 1, pid: 0, type: 'link', name: '商城页面', sort: 100 }),
  category({ id: 2, pid: 0, type: 'diy', name: 'DIY页面', sort: 95 }),
  category({ id: 3, pid: 0, type: 'product', name: '商品页面', sort: 90 }),
  category({ id: 4, pid: 0, type: 'article', name: '文章页面', sort: 85 }),
  category({ id: 6, pid: 0, type: 'custom', name: '自定义', sort: 75 }),
  category({ id: 7, pid: 1, type: 'link', name: '商城链接', sort: 100 }),
  category({ id: 8, pid: 1, type: 'link', name: '营销链接', sort: 95 }),
  category({ id: 9, pid: 2, type: 'special', name: 'DIY页面', sort: 100 }),
  category({ id: 11, pid: 3, type: 'product', name: '商品', sort: 95 }),
  category({ id: 19, pid: 7, type: 'link', name: '基础链接', sort: 100 }),
  category({ id: 20, pid: 7, type: 'link', name: '个人中心链接', sort: 95 }),
];

function link(overrides: Partial<LegacyPageLink> & { id: number }): LegacyPageLink {
  return {
    cate_id: 19,
    type: 1,
    name: '',
    url: '',
    param: '',
    example: '',
    status: 1,
    sort: 0,
    add_time: 1735111883,
    ...overrides,
  };
}

const seedLinks: LegacyPageLink[] = [
  link({ id: 1, cate_id: 19, name: '商城首页', url: '/pages/index/index' }),
  link({ id: 2, cate_id: 19, name: '商品分类', url: '/pages/goods_cate/goods_cate' }),
  link({ id: 4, cate_id: 19, name: '个人中心', url: '/pages/user/index' }),
  // 6 and 14 are the same route under two names; the new unique index refuses it.
  link({
    id: 6,
    cate_id: 19,
    name: '我的订单',
    url: '/pages/goods/order_list/index',
    add_time: 1735112748,
  }),
  link({
    id: 14,
    cate_id: 20,
    name: '订单中心',
    url: '/pages/goods/order_list/index',
    add_time: 1735113414,
  }),
  link({
    id: 9,
    cate_id: 20,
    name: '用户信息',
    url: '/pages/users/user_info/index',
    add_time: 1735113292,
  }),
  // A link filed under a dynamic group, which does not survive as a category.
  link({ id: 50, cate_id: 9, name: '某个专题页', url: '/pages/annex/special/index' }),
];

const seedThemes: LegacyTheme[] = [
  {
    id: 1,
    title: '默认主题',
    info: '系统内置',
    type: 0,
    home_data: JSON.stringify(HOME_VALUE),
    home_image: 'https://example.test/home.png',
    category_data: '',
    category_image: '',
    detail_data: '',
    detail_image: '',
    user_data: '',
    user_image: '',
    theme_data: '{"theme":"red"}',
    home_default_data: JSON.stringify(HOME_VALUE),
    category_default_data: '',
    detail_default_data: '',
    user_default_data: '',
    theme_default_data: '',
    page_type: 'theme',
    is_use: 1,
    is_del: 0,
    add_time: 1676448601,
    up_time: 1740452156,
  },
  {
    id: 2,
    title: '双十一',
    info: '',
    type: 1,
    home_data: JSON.stringify(HOME_VALUE),
    home_image: '',
    category_data: '',
    category_image: '',
    detail_data: '',
    detail_image: '',
    user_data: '',
    user_image: '',
    theme_data: '',
    home_default_data: '',
    category_default_data: '',
    detail_default_data: '',
    user_default_data: '',
    theme_default_data: '',
    page_type: 'theme',
    is_use: 0,
    is_del: 0,
    add_time: 1676448601,
    up_time: 1676448601,
  },
];

const full = () =>
  mapDiy({
    diy: seedDiy,
    themes: seedThemes,
    linkCategories: seedCategories,
    links: seedLinks,
  });

describe('mapDiy — pages', () => {
  it('migrates the three visual pages and none of the settings rows', () => {
    const { pages, report } = full();

    expect(pages.map((page) => page.id)).toEqual([6, 7, 8]);
    expect(report.pages).toBe(3);
    expect(report.pagesDroppedSettingsRow).toBe(3);
  });

  it('keeps the settings rows as numbers in the report rather than dropping them', () => {
    const { report } = full();

    expect(report.settings).toEqual({
      themeColourIndex: 1,
      categoryLayout: 2,
      userCenterLayout: 1,
    });
    expect(report.dropped.filter((row) => row.table === 'eb_diy' && row.id === 2)).toHaveLength(1);
  });

  it('copies the page envelope byte for byte — DIY-001', () => {
    const { pages } = full();

    expect(JSON.stringify(pages[0]!.content)).toBe(JSON.stringify(HOME_VALUE));
  });

  it('makes the in-use template the home page and the rest drafts', () => {
    const { pages } = full();

    expect(pages.map((page) => [page.id, page.status, page.isHome])).toEqual([
      [6, 'draft', false],
      [7, 'draft', false],
      [8, 'published', true],
    ]);
    expect(pages[2]!.publishedAt).toEqual(new Date(1741225427 * 1000));
    expect(pages[0]!.publishedAt).toBeNull();
  });

  it('leaves exactly one home page when the dump holds several', () => {
    const { pages, report } = mapDiy({
      diy: [
        diy({ id: 6, name: '旧首页', value: HOME_VALUE, status: 1, update_time: 1740452156 }),
        diy({ id: 8, name: '新首页', value: HOME_VALUE, status: 1, update_time: 1741225427 }),
      ],
    });

    expect(pages.filter((page) => page.isHome).map((page) => page.id)).toEqual([8]);
    expect(report.extraHomeFlagsCleared).toBe(1);
    // The loser is still published, and named.
    expect(pages[0]!.status).toBe('published');
    expect(report.dropped.some((row) => row.id === 6)).toBe(true);
  });

  it('never repaints a page whose background flags are off', () => {
    const { pages } = full();

    // Every row in the dump carries color_picker '#f5f5f5' with is_bg_color 0.
    expect(pages.every((page) => page.background === null)).toBe(true);
  });

  it('carries a background that really was switched on', () => {
    const { pages } = mapDiy({
      diy: [
        diy({
          id: 6,
          name: '首页',
          value: HOME_VALUE,
          is_bg_color: 1,
          color_picker: '#f5f5f5',
          is_bg_pic: 1,
          bg_pic: 'https://example.test/bg.png',
          bg_tab_val: 2,
        }),
      ],
    });

    expect(pages[0]!.background).toEqual({
      color: '#f5f5f5',
      imageUrl: 'https://example.test/bg.png',
      imageMode: 'fixed',
    });
  });

  it('drops a deleted row and a row whose value holds no page, and names both', () => {
    const { pages, report } = mapDiy({
      diy: [
        diy({ id: 6, name: '已删除', value: HOME_VALUE, is_del: 1 }),
        diy({ id: 7, name: '空模板', value: '[]' }),
        diy({ id: 8, name: '坏 JSON', value: '{oops' }),
      ],
    });

    expect(pages).toHaveLength(0);
    expect(report.pagesDroppedDeleted).toBe(1);
    expect(report.pagesDroppedNoContent).toBe(2);
    expect(report.dropped.map((row) => [row.table, row.id])).toEqual([
      ['eb_diy', 6],
      ['eb_diy', 7],
      ['eb_diy', 8],
    ]);
  });

  it('reports a 微页面 rather than letting it claim the home flag', () => {
    const { pages, report } = mapDiy({
      diy: [diy({ id: 9, name: '微页面', value: HOME_VALUE, type: 2, status: 1 })],
    });

    expect(pages[0]!.kind).toBe('micro');
    expect(pages[0]!.isHome).toBe(false);
    expect(report.extraHomeFlagsCleared).toBe(1);
  });

  it('counts the default_value payloads it does not migrate', () => {
    const { report } = mapDiy({
      diy: [diy({ id: 6, name: '首页', value: HOME_VALUE, default_value: HOME_VALUE })],
    });

    expect(report.defaultValuesNotMigrated).toBe(1);
  });
});

describe('mapDiy — themes', () => {
  it('splits the legacy columns into the per-surface envelope', () => {
    const { themes } = full();

    expect(themes[0]).toMatchObject({
      id: 1,
      name: '默认主题',
      intro: '系统内置',
      kind: 'custom',
      isActive: true,
      previewImages: { home: 'https://example.test/home.png' },
    });
    expect(themes[0]!.data.tokens).toEqual({ theme: 'red' });
    expect(themes[0]!.defaultData?.home).toEqual(HOME_VALUE);
    expect(themes[1]!.defaultData).toBeNull();
  });

  it('migrates a 广场主题 as built-in, so the new schema refuses to edit it', () => {
    const { themes } = full();

    expect(themes[1]).toMatchObject({ id: 2, kind: 'built_in', isActive: false });
  });

  it('drops a deleted theme and a 微页面 theme, and names both', () => {
    const [first, second] = seedThemes;
    const { themes, report } = mapDiy({
      themes: [
        { ...first!, id: 3, is_del: 1 },
        { ...second!, id: 4, page_type: 'micro' },
      ],
    });

    expect(themes).toHaveLength(0);
    expect(report.themesDroppedDeleted).toBe(1);
    expect(report.themesDroppedMicro).toBe(1);
    expect(report.dropped.map((row) => [row.table, row.id])).toEqual([
      ['eb_theme', 3],
      ['eb_theme', 4],
    ]);
  });

  it('leaves exactly one active theme', () => {
    const [first, second] = seedThemes;
    const { themes, report } = mapDiy({
      themes: [
        { ...first!, id: 1, is_use: 1, up_time: 1 },
        { ...second!, id: 2, is_use: 1, up_time: 2 },
      ],
    });

    expect(themes.filter((theme) => theme.isActive).map((theme) => theme.id)).toEqual([2]);
    expect(report.extraActiveThemesCleared).toBe(1);
  });
});

describe('mapDiy — the link registry', () => {
  it('keeps the static link groups and reports the dynamic ones', () => {
    const { linkCategories, report } = full();

    expect(linkCategories.map((row) => row.id)).toEqual([1, 7, 8, 19, 20]);
    expect(report.linkCategoriesDroppedDynamic).toBe(6);
    expect(report.dropped.some((row) => row.reason.includes("type = 'product'"))).toBe(true);
  });

  it('keeps the category tree', () => {
    const { linkCategories } = full();

    expect(linkCategories.find((row) => row.id === 19)).toMatchObject({
      parentId: 7,
      name: '基础链接',
      isEnabled: true,
      sortOrder: 100,
    });
    expect(linkCategories.find((row) => row.id === 1)!.parentId).toBeNull();
  });

  it('re-roots a category whose parent was dropped', () => {
    const { linkCategories, report } = mapDiy({
      linkCategories: [
        category({ id: 3, type: 'product', name: '商品页面' }),
        category({ id: 30, pid: 3, type: 'link', name: '商品链接' }),
      ],
    });

    expect(linkCategories).toHaveLength(1);
    expect(linkCategories[0]!.parentId).toBeNull();
    expect(report.categoriesDetachedFromDroppedParent).toBe(1);
  });

  it('drops the second link on a duplicate url and says which one won', () => {
    const { links, report } = full();

    expect(links.map((row) => row.id)).toEqual([1, 2, 4, 6, 9, 50]);
    expect(report.linksDroppedDuplicateUrl).toBe(1);
    expect(report.dropped.find((row) => row.id === 14)?.reason).toContain(
      'already migrated as #6 我的订单',
    );
  });

  it('detaches a link whose category was a dynamic group', () => {
    const { links, report } = full();

    expect(links.find((row) => row.id === 50)!.categoryId).toBeNull();
    expect(report.linksDetachedFromDroppedCategory).toBe(1);
  });

  it('carries the empty-string columns over as null', () => {
    const { links } = full();
    const home = links.find((row) => row.id === 1)!;

    expect(home.paramName).toBeNull();
    expect(home.example).toBeNull();
    expect(home.isEnabled).toBe(true);
    expect(home.createdAt).toEqual(new Date(1735111883 * 1000));
  });

  it('keeps the legacy ids, so a support ticket quoting one still works', () => {
    const { pages, themes, linkCategories, links } = full();

    expect(pages.map((row) => row.id)).toEqual([6, 7, 8]);
    expect(themes.map((row) => row.id)).toEqual([1, 2]);
    expect(linkCategories.map((row) => row.id)).toEqual([1, 7, 8, 19, 20]);
    expect(links.map((row) => row.id)).toEqual([1, 2, 4, 6, 9, 50]);
  });
});

describe('mapDiy — the report', () => {
  it('accounts for every input row', () => {
    const { pages, themes, linkCategories, links, report } = full();

    const migrated = pages.length + themes.length + linkCategories.length + links.length;
    const inputs = seedDiy.length + seedThemes.length + seedCategories.length + seedLinks.length;
    const droppedRows =
      report.pagesDroppedDeleted +
      report.pagesDroppedSettingsRow +
      report.pagesDroppedNoContent +
      report.themesDroppedDeleted +
      report.themesDroppedMicro +
      report.linkCategoriesDroppedDynamic +
      report.linksDroppedDuplicateUrl;

    expect(migrated + droppedRows).toBe(inputs);
  });

  it('is empty for empty input', () => {
    const { pages, themes, linkCategories, links, report } = mapDiy({});

    expect([pages, themes, linkCategories, links].every((rows) => rows.length === 0)).toBe(true);
    expect(report.dropped).toEqual([]);
    expect(report.settings).toEqual({
      themeColourIndex: null,
      categoryLayout: null,
      userCenterLayout: null,
    });
  });
});
