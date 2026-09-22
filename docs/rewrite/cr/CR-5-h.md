# CR-5-h — `POST /api/v1/uploads` does not say what the multipart field is called, and the staff console has no purpose

- **Stream:** H (uni-app storefront), raised against F1 (system / storage)
- **Status:** **resolved** — both accepted, stream S, `ea91eb78`

> **Decision.**
>
> 1. The multipart field is `file` and only `file`, stated in the contract and
>    enforced: a file under another name is `STORAGE_UPLOAD_FIELD_MISSING` with
>    `{expected, received}`, no file at all is `STORAGE_NO_FILE`, and further
>    file parts are ignored.
> 2. `purpose: 'staff'` exists, gated on the 店员 check, with its own directory,
>    size ceiling and hourly budget.
>
> One line is left to stream H2: `pages/admin/goods/addGoods.vue` must ask for
> `{ purpose: 'staff' }` instead of `{ url: 'upload/image' }`. Until it does,
> those uploads keep landing in `review`, as they did before. See
> `docs/rewrite/status/s.md`.
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

**Resolved:** `uploadPurposeFor()` now passes through any purpose the contract
has, so the page only needs to name `staff`. Until it does, 添加商品 still maps
to `review`.
