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
   - Migration `0006_mini_shipping_management`: `wechat_trade_orders`,
     `express_companies.wechat_delivery_id`.
   - Routes: `/api/v1/webhooks/wechat-mini`, `/api/v1/orders/:id/wechat-receipt`,
     `/admin-api/wechat-mini-trade` (+ `/sync`, button on 系统设置 → 小程序发货信息管理);
     `order.confirmReceipt` body `{ via: 'wechat-component' }`.
   - WXSHIP-001…007; C07 updated (deviation: separate wechat-receipt endpoint; sync is manual).

5. 内容安全 (C09, policy of 2026-09-23)
   - `wechat/wechat.sec-check.ts` (+ `.repo.ts`, `.config.ts` group `content-security`):
     port + driver for `msg_sec_check` / `media_check_async`; `checkText`, `requestMediaCheck`,
     `wxa_media_check` handler; migration `0007_content_security` (`content_security_checks`,
     `product_reviews.moderation_reason`).
   - Review text: risky / review / unavailable → saved 待审核 with a reason, response
     `moderation: 'pending'`, never an error; admin approves/deletes in the existing 评价管理
     (reason shown under the status tag).
   - Nickname / 抬头 book / order invoice request: `risky` → 422 (`USER_NICKNAME_REJECTED`,
     `USER_INVOICE_TITLE_REJECTED`, `ORDER_INVOICE_TITLE_REJECTED`); unavailable → saved.
   - Pictures async: review image risky → removed from the review; avatar risky → reset +
     in-app `user_avatar_rejected` (sent by `notification` via `user.onAvatarRejected`, to
     avoid a user → notification → order → user import cycle).
   - Fake OA: `msg_sec_check` (risky word 违规测试, review word 待定测试), `media_check_async`,
     `mediaCheckPush`, `failSecCheck` / `failMediaCheck`. CONTENT-001…005; C09 rewritten.

Merged storefront/mini at 84f28a645+ (F1 decor, I1 guards): our migrations renumbered to
0005–0007 after `0004_decor`, `EXPECTED_MIGRATIONS = 8`; `/api/v1/pages` routes read
`ctx.clientVersion`.

## In progress

- 4: route catalogue adoption.

## Next

- Final checklist and report.
