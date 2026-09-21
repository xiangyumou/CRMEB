# Golden slice — Coupons

**Branch** `rewrite/ws-golden-coupon` · **Worktree** `../CRMEB-wt/ws-golden` · **Owns** domain `coupon` (every path in the CONVENTIONS table) plus `docs/rewrite/GOLDEN.md`

This slice is the pattern every other stream copies. It is judged less on feature breadth than on being a clean, complete, small example of each kind of file. Prefer the obvious structure over the clever one; when the platform makes something awkward, file a CR rather than working around it quietly — the awkwardness would otherwise be copied fifteen times.

## Scope

Admin: coupon template list (filter by status, scope, claim mode; sort), create, edit, enable/disable, soft delete, grant to chosen users, list of claimed coupons per template and per user. Product and category scope pickers may use id inputs until stream A lands; say so in the status file.

Storefront (`/api/v1`): claimable templates (with the caller's claimed/remaining state when authenticated, `user-optional`), claim, my coupons by state (`unused`, `used`, `expired`), coupons applicable to a set of cart lines with a subtotal (the checkout picker: input is lines `{productId, categoryIds, amount}` so this domain never reads catalog tables), new-user coupons.

Domain API for other streams, exported from `core/src/coupon/index.ts`:
- `quote(ctx, {userCouponId, userId, lines})` → discount `Money` and the eligible line indexes, or a domain error. Pure read.
- `redeem(tx, {userCouponId, userId, orderId})` — one conditional update (`status = 'unused'`, owner matches, inside validity window); zero rows → domain error. Called by B1 inside its order transaction.
- `release(tx, {userCouponId, orderId})` — conditional update back to `unused` on cancel/refund; a coupon whose window has passed becomes `expired` instead.
- `grantNewUser(tx, userId)` — called by E1 on registration.
- `grantOrderGifts(tx, {userId, orderId, productIds})` — `product_gift_coupons` and `order_gift` templates, called from the order-paid hook; idempotent per order through `user_coupons.source_order_id`.

Jobs: a repeatable sweep that marks overdue `unused` coupons `expired` in batches, and disables templates whose claim window has ended.

Config: none. Permissions: `coupon:template:{read,write,delete}`, `coupon:grant:write`, `coupon:user-coupon:read`.

ETL mapper: `eb_store_coupon_issue` (+ `eb_store_coupon_product`) → `coupon_templates` and scope links, `eb_store_coupon_user` → `user_coupons` for the one kept user. Rows with legacy `receive_type = 4` (member coupons) are dropped and counted in the report. If `packages/etl` has no runner yet, write the mapper as a pure function with a unit test against literal legacy rows, and note it.

## Invariants to prove

`docs/rewrite/invariants.md` COUPON-001 … COUPON-008. COUPON-001/002 concern a retired coupon kind that has no representation in the new schema: map them to the ETL test that drops those rows and mark the storefront parts "retired: no member claim mode exists". COUPON-003 … 008 each need a named test; 006, 007 and 008 are `runConcurrently` tests against real PostgreSQL:

- last coupon claimed twice → one winner, `remaining_count` never negative (conditional `UPDATE … SET remaining_count = remaining_count - 1 WHERE … AND (is_unlimited_supply OR remaining_count > 0)`);
- one user claiming twice at once → per-user limit holds through `UNIQUE(template_id, user_id, claim_slot)`; treat the unique violation as the domain error, not a 500;
- two redemptions of one coupon → one winner.

## Fix, don't port

- Legacy claim is read-then-write on `remain_count` guarded by a Redis lock. Use the conditional update; no lock.
- Legacy keeps a separate claim log table. `user_coupons` is the log.
- Legacy returns `""`/`0` for absent dates and limits. Omit or `null`.

## `docs/rewrite/GOLDEN.md`

Write it last, from the finished code. One section per file kind, in the order an executor builds them: contract (`schemas.ts`, `errors.ts`, `*.contract.ts` with examples) → repo → service → concurrency test → `index.ts` public surface → permissions → route handler → job → admin page (list with `CrudTable`, `ModalForm` create/edit, a `Can`-guarded action) → menu → ETL mapper → invariants rows. For each: the path, a short real excerpt, and the two or three rules that make it right ("decide on affected rows", "examples must be truthful", "route files hold no logic"). End with a checklist a stream can copy into its status file. Keep it under 400 lines; link to files rather than pasting them whole.

## Out of scope

Coupon use inside order pricing (B1 calls `quote`/`redeem`), the DIY coupon component's data endpoint (G1, through `coupon`'s index), member coupons, points-priced coupons, product-page "coupons for this product" beyond what the applicable-coupons endpoint already answers.
