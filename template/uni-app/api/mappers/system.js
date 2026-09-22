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

/** The four purposes `POST /api/v1/uploads` accepts (`userUploadPurpose`). */
const UPLOAD_PURPOSES = ['avatar', 'review', 'refund', 'staff'];

/**
 * Which bucket an upload lands in; the query `POST /api/v1/uploads` takes.
 *
 * A caller that knows its purpose says so (`{ purpose: 'refund' }`) and is taken
 * at its word — but only if it names one the contract has, so a typo lands in
 * `review` rather than being refused by the server with a 422 the page cannot
 * explain. Everything else is guessed from the legacy upload path, which is all
 * the old pages pass.
 *
 * `staff` is 商家管理's 添加商品 (CR-5-h §2): a shop asset, not a shopper's, with
 * its own directory, size ceiling and hourly budget, and refused outright unless
 * the caller is on the 店员 list. It must be asked for explicitly — the legacy
 * path there is `upload/image`, the same one 评价 and 订单备注 send, so there is
 * nothing in the URL to tell them apart.
 */
export function uploadPurposeFor(legacyUrl) {
  const path = text(legacyUrl);
  if (UPLOAD_PURPOSES.indexOf(path) !== -1) return path;
  if (path.indexOf('avatar') !== -1) return 'avatar';
  if (path.indexOf('refund') !== -1) return 'refund';
  return 'review';
}
