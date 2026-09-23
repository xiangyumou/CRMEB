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
     a stored value is stripped on read; migration `0005_groupbuy_virtual_fill_off` deletes it
     (rollback safety). Expiring under-filled teams fail and refund.
   - 立即成团 refuses every under-filled team (`GROUPBUY_VIRTUAL_FILL_DISABLED`, new message);
     admin alert text updated. RISK-D-006 rewritten; compliance C02 updated.

3. Fakes
   - Fake OA/mini server: login and phone codes are single-use (second use → 40163, never
     issued → 40029); `reset()` clears spent codes.
   - Fake WeChat Pay gateway remembers `prepay_id → out_trade_no` (`transactionForPrepay`);
     the e2e `mini/request-payment` hook takes only `{package}` like `wx.requestPayment`, so
     the emulated client cannot pay an order it did not prepay. `test:mini` green.

4. 发货信息管理 (C07)
   - Port/driver/fake: `wechat/wechat.shipping.ts`; fake OA server speaks `wxa/sec/order/*`
     with WeChat's refusals; `@shop/testing/wechat` `buildMiniPush` (independent crypto).
   - `payment/payment.mini-trade.ts`: dispatch hook → effect `wechat.uploadShipping`
     (mini-paid + switch on; unified/split frozen in payload), correction once, push handlers
     (settlement → received, reminders → admin notices), receipt verifier (`get_order`).
   - Migration `0005`: `wechat_trade_orders`, `express_companies.wechat_delivery_id`.
   - Routes: `/api/v1/webhooks/wechat-mini`, `/api/v1/orders/:id/wechat-receipt`,
     `/admin-api/wechat-mini-trade` (+ `/sync`, button on 系统设置 → 小程序发货信息管理);
     `order.confirmReceipt` body `{ via: 'wechat-component' }`.
   - WXSHIP-001…007; C07 updated (deviation: separate wechat-receipt endpoint; sync is manual).

## In progress

- 6: content security (review text risky → pending moderation, per 2026-09-23 policy).

## Next

- 4 route catalogue (merge storefront/mini @6b4f48b96; jump path via `toMiniPath`), checklist.
