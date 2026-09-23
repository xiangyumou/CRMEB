// 省市区 DTO → the three-column picker `pages/users/user_address` and the three
// `userAddress.vue` components walk.
//
// Contract: next/packages/contracts/src/shipping/shipping.city.contract.ts
//
// The picker wants a tree of `{v, n, c}` — value, name, children — and the
// picker indexes into it by position on every `columnchange`, so the nesting and the
// key names both have to survive. `level` is dropped: depth is already the position
// in the tree, and nothing reads it.
//
// The tree is immutable seed data, so `version` is carried alongside for a caller
// that wants to cache it; nothing in the uni-app does yet.

import { toId, mapList, text } from './_shared.js';

function toPageCityNode(dto) {
  const node = {
    v: toId(dto && dto.id),
    n: text(dto && dto.name),
    c: mapList(dto && dto.children, toPageCityNode),
  };
  // `city_id` is submitted as the *city* (level 1) id, and the picker reads `.c`
  // before it knows the depth, so an empty array is the only safe leaf.
  return node;
}

/** `cityTree` → the bare array the picker assigns to `district`. */
export function toPageCityTree(dto) {
  const items = mapList(dto && dto.items, toPageCityNode);
  // The picker does `district[0].c` without a guard, so an empty tree would throw.
  return items;
}

/** The tree's fingerprint, for a caller that caches it. */
export function cityTreeVersion(dto) {
  return text(dto && dto.version);
}
