# H2 (backend, contract owner) — status

Branch `storefront/mini-H2-backend`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/H2-backend`.
Brief: small API fixes → group-buy virtual fill off → fakes → 发货信息管理 → content security →
route-catalogue adoption (after R0 merges) → merge checklist.

## Done

1. Small API fixes
   - `PUT /api/v1/cart/items/:id` (`cart.updateItemPut`), same service and body as the PATCH.
   - `GET /api/v1/express-companies` (`shipping.expressCompanyOptions`, public), the enabled
     carriers for the 退货物流 form.
   - `pageQuery.page/pageSize` input typed `number | string` (was `unknown`); wire format unchanged.
   - `X-Client-Version` parsed in `handle()` into `ctx.clientVersion` (optional; junk ignored).

2. Group-buy 虚拟成团 off for good
   - `virtualFillOnExpiry` removed from the `groupbuy` config group (so off the settings screen);
     a stored value is stripped on read; migration `0004_groupbuy_virtual_fill_off` deletes it
     (rollback safety). Expiring under-filled teams fail and refund.
   - 立即成团 refuses every under-filled team (`GROUPBUY_VIRTUAL_FILL_DISABLED`, new message);
     admin alert text updated. RISK-D-006 rewritten; compliance C02 updated.

3. Fakes
   - Fake OA/mini server: login and phone codes are single-use (second use → 40163, never
     issued → 40029); `reset()` clears spent codes.
   - Fake WeChat Pay gateway remembers `prepay_id → out_trade_no` (`transactionForPrepay`);
     the e2e `mini/request-payment` hook takes only `{package}` like `wx.requestPayment`, so
     the emulated client cannot pay an order it did not prepay. `test:mini` green.

## In progress

- 5: 发货信息管理.

## Next

- 6 content security, 4 route catalogue (R0 merged at 6b4f48b96), checklist.
