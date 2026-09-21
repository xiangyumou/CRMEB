# CR-5-h — `POST /api/v1/uploads` does not say what the multipart field is called, and the staff console has no purpose

- **Stream:** H (uni-app storefront), raised against F1 (system / storage)
- **Status:** open
- **Affects:** `next/packages/contracts/src/storage/storage.storefront.contract.ts`,
  `storage/schemas.ts`

## 1. The field name is not in the contract

`storageUserUpload` describes the query (`purpose`) and the response, but a
multipart upload also has a **field name**, and nothing in the contract or in
`openapi.json` names it. `uni.uploadFile` has to pick one at the call site:

```js
uni.uploadFile({ url: …, filePath, name: 'file', header, … });   // utils/util.js
```

H chose `file`. If the server reads `image` (legacy's name) or anything else,
every upload in the app fails with `STORAGE_NO_FILE` and no static check
catches it — `scripts/check-api-routes.mjs` can only prove the method and the
path.

**Ask:** state it in the contract — a doc comment on `storageUserUpload` is
enough, `requestBody: multipart/form-data {file: binary}` in the OpenAPI is
better — and say whether a second file in the same request is an error or is
ignored. H's assumption: the field is `file`, exactly one per request.

## 2. 商家管理 uploads have no purpose

`userUploadPurpose` is `avatar | review | refund`. The staff console's 添加商品
screen uploads product images (`pages/admin/goods/addGoods.vue`), which is
none of those: it is a shop asset, not a shopper's, and it should almost
certainly land in the media library that stream F1's admin upload writes to.

Today that call sends `purpose=review`, which is wrong on every axis — wrong
bucket, wrong retention, and it counts against the shopper's rate limit.

**Ask:** either add a `product` purpose gated on `auth: 'staff'`, or tell H to
route the staff console at the admin upload route with a staff credential. This
is B2-adjacent (the staff console is B2's surface) but the decision is F1's,
because it is about where the bytes go.

**Until then:** `uploadPurposeFor()` maps the 添加商品 site to `review` and the
call is marked in `api/mappers/system.js`.
