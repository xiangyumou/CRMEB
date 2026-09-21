// system / storage DTOs → the legacy payloads.
//
// Contracts: next/packages/contracts/src/system/system.settings.contract.ts
//            next/packages/contracts/src/storage/storage.storefront.contract.ts

import { toInt, text, legacyDateTime } from './_shared.js';

/** `GET /api/v1/agreements/:key` → what `getUserAgreement` resolved with. */
export function toLegacyAgreement(dto) {
  if (!dto) return { title: '', content: '' };
  return {
    key: text(dto.key),
    title: text(dto.title),
    content: text(dto.content),
    update_time: legacyDateTime(dto.updatedAt),
  };
}

/** Legacy agreement slug (`user`, `privacy`, `sale`) — unchanged, but normalised. */
export function fromLegacyAgreementKey(type) {
  const key = text(type, 'user');
  if (key === 'userinfo' || key === 'user_info') return 'user';
  return key;
}

/**
 * `POST /api/v1/uploads` → the legacy upload payload.
 * `utils/util.js` wraps the raw HTTP response itself, so this is the *inner* shape.
 */
export function toLegacyUpload(dto) {
  if (!dto) return {};
  return {
    url: text(dto.url),
    name: text(dto.name),
    type: text(dto.mime),
    size: toInt(dto.size, 0),
    width: toInt(dto.width, 0),
    height: toInt(dto.height, 0),
  };
}

/** Which bucket an upload lands in; the query `POST /api/v1/uploads` takes. */
export function uploadPurposeFor(legacyUrl) {
  const path = text(legacyUrl);
  if (path.indexOf('avatar') !== -1) return 'avatar';
  if (path.indexOf('refund') !== -1) return 'refund';
  // `review` is also where 商家管理's 添加商品 lands, which is wrong on every axis: the
  // contract's three purposes are all the shopper's. See docs/rewrite/cr/CR-5-h.md.
  return 'review';
}
