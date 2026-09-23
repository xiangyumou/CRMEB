// diy DTOs → the legacy 装修 payload `pages/index`, `pages/annex/special` and
// `subpackage/diyComponents/pageDesign.vue` render.
//
// Contract: next/packages/contracts/src/diy/storefront.contract.ts
//
// The component tree itself is *not* remapped: `content` is the same timestamp-keyed
// object the renderer already walks. Only the page chrome around it changed names.

import { toId, text } from './_shared.js';

/** `diyStorefrontPage` → `{title, value, is_bg_color, color_picker, …}`. */
export function toLegacyDiyPage(dto) {
  if (!dto) return {};
  const bg = dto.background || {};
  return {
    id: toId(dto.id),
    name: text(dto.name),
    title: text(dto.title),
    type: text(dto.kind, 'home'),
    // The renderer calls this `value` and walks it with `objToArr`.
    value: dto.content || {},
    is_bg_color: bg.color ? 1 : 0,
    color_picker: text(bg.color),
    is_bg_pic: bg.imageUrl ? 1 : 0,
    bg_pic: text(bg.imageUrl),
    bg_tab_val: text(bg.imageMode),
    version: text(dto.version),
    schema_version: dto.schemaVersion === undefined ? 1 : dto.schemaVersion,
  };
}

/** `GET /api/v1/diy/version` → `{version}`; pages compare it with the cached one. */
export function toLegacyDiyVersion(dto) {
  return { version: text(dto && dto.version) };
}

/**
 * `GET /api/v1/diy/theme` → the token bag `mixins/color.js` feeds into CSS variables.
 * The legacy payload nested them under `status`; the renderer only reads the map.
 */
export function toLegacyTheme(dto) {
  const tokens = (dto && dto.tokens) || {};
  return {
    id: toId(dto && dto.id),
    name: text(dto && dto.name),
    status: tokens,
    tokens,
    version: text(dto && dto.version),
  };
}

// ---------------------------------------------------------------------------
// 底部导航、版式 (F4 — CR-3-h2 §2/§3)
// ---------------------------------------------------------------------------

/**
 * What `components/pageFooter` does with a component whose `effectConfig.tabVal` is
 * 0: `uni.showTabBar()` and nothing of its own. Complete enough that every style
 * computed on it (`bgColor.color[0].item`, `fillet.valList[n].val`, …) resolves.
 */
const NATIVE_TAB_BAR = {
  name: 'pageFoot',
  effectConfig: { tabVal: 0 },
  navConfig: { tabVal: 0 },
  navStyleConfig: { tabVal: 0 },
  toneConfig: { tabVal: 0 },
  menuList: [],
  txtColor: { color: [{ item: '#333333' }] },
  activeTxtColor: { color: [{ item: '#E93323' }] },
  bgColor: { color: [{ item: '#FFFFFF' }] },
  bgColor2: { color: [{ item: '#FFFFFF' }] },
  fillet: { type: 0, val: 0, valList: [{ val: 0 }, { val: 0 }, { val: 0 }, { val: 0 }] },
  topConfig: { val: 0 },
  bottomConfig: { val: 0 },
  prConfig: { val: 0 },
  mbConfig: { val: 0 },
};

/**
 * `GET /api/v1/diy/navigation` → the saved `pageFoot` component itself, which is what
 * `setNavigationInfo` and `goods_cate1`'s `newData` take (F4 returns it verbatim
 * under `navigation`). `navigation: null` — no published home page — means "use
 * the native tab bar", spelled as a component that says so.
 */
export function toLegacyNavigation(dto) {
  const nav = dto && dto.navigation;
  return nav && typeof nav === 'object' ? nav : NATIVE_TAB_BAR;
}

/** `GET /api/v1/diy/layouts/:type` → `{status}`; `goods_cate` tests `status == 2 || 3`. */
export function toLegacyLayout(dto) {
  return { status: toId(dto && dto.status) || 1 };
}

/**
 * `GET /api/v1/diy/layouts/user` → what `pages/user` reads off `getMenuList()`:
 * `diy_data.value` is the 个人中心 版式 (`member_style`), and `routine_my_menus` is
 * walked but no longer rendered — the tiles are components on the 个人中心 DIY page
 * (`getThemeInfo('user')`) now — so it is an empty list.
 */
export function toLegacyUserMenus(dto) {
  return {
    diy_data: {
      value: toId(dto && dto.status) || 1,
      my_banner_status: 0,
      my_menus_status: 0,
      business_status: 0,
    },
    routine_my_menus: [],
  };
}
