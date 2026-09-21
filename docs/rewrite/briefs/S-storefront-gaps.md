# Stream S — storefront contract gaps (CR-1..5-h)

**Worktree** `../CRMEB-wt/ws-s` · **Branch** `rewrite/ws-s-storefront-gaps` · starts after the B1 and C fix-up passes are merged · **Owns for this task** the contract, core and route files the items below name, in the `order`, `cart`, `catalog`, `refund`, `storage` domains, plus the matching edits in `template/uni-app/api/**` (remove the `CONTRACT-PENDING` marker, re-point, extend the mapper and its test)

Stream H re-pointed the uni-app storefront at the new API and found operations the pages perform that no contract expresses. Read `docs/rewrite/cr/CR-{1,2,3,4,5}-h.md` in full, then `docs/rewrite/status/{h,b1,b2,a,c,f1}.md`. Decisions:

| CR | Decision |
|---|---|
| CR-1-h | **Accept.** Storefront order routes take `:id` as either the numeric id or the order number (the two never collide: order numbers are not plain integers — assert that in a test). Resolve once in a shared helper scoped to the owner (`user_id` in the WHERE, a stranger gets the same 404). Same for the payment and refund routes that take an order reference, if H's table lists them. |
| CR-2-h | **Accept all three.** (1) change a cart row's SKU: `PATCH /api/v1/cart/items/:id` accepts `skuId`; merging into an existing row of that SKU is one transaction, stock and purchase-limit rules re-checked. (2) decrement by SKU: `POST /api/v1/cart/items/decrements` `{skuId, quantity}`; conditional update, removes the row at zero. (3) batch favourite: `POST /api/v1/me/favorites/batch` `{productIds}` (idempotent, capped at 50). |
| CR-3-h | **Accept.** `GET /api/v1/catalog/categories` answers with an `ETag` derived from `max(updated_at)` + count, honours `If-None-Match` with 304. If `handle()` cannot express 304/ETag, file the kit change as a CR with the patch and expose `GET /api/v1/catalog/categories/version` → `{version}` meanwhile. |
| CR-4-h §1 | **Accept**: per-day breakdown on the staff statistics route (range capped at 92 days, Asia/Shanghai days). |
| CR-4-h §2 | **Accept**: staff remark on a refund (`refunds.staff_remark` exists? if not, write it to `refund_logs` as a `remark` entry — no schema change). |
| CR-4-h §3 | **Rejected — as H suspected.** No "direct refund" that bypasses review; staff approve through C's review route. H deletes the UI branch. |
| CR-4-h §4, §5 | **Out of scope** (city delivery, electronic waybills — retired). H deletes the UI branches. |
| CR-4-h §6 | **Accept**: buyer hides a finished order — `orders.user_hidden_at` if the column exists; otherwise file a schema CR and skip. Hidden orders stay visible to the shop. Only `completed`, `cancelled`, `refunded`. Conditional update. |
| CR-4-h §7 | **Accept**: invoice records carry the order's line summary (name, image, spec, quantity) read through the order domain. |
| CR-5-h | **Accept**: the multipart field name (`file`) is stated in the contract description and enforced (wrong field → `STORAGE_UPLOAD_FIELD_MISSING`); add `purpose: 'staff'` gated on the staff check, with its own size/type limits. |

Every accepted item: contract with truthful examples first, service + int test (a `runConcurrently` test for each conditional update), route, then the uni-app side. `npm run check:routes` and `npm test` in `template/uni-app` must stay green and the pending count must drop by exactly the calls you cleared. Whole-workspace verification as in the template. Status in `docs/rewrite/status/s.md`; mark each CR file with the decision and what landed.
