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
