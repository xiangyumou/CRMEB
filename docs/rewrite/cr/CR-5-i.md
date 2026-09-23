# CR-5-i — the fake WeChat Pay gateway answers H5 creates with `prepay_id`, not `h5_url`

- **Stream:** I (storefront e2e), raised against the owner of `@shop/testing`'s WeChat fakes
  (`next/packages/testing/src/wechat/fake-gateway.ts`). The orchestrator routes it.
- **Status:** **open** (worked around in stream I's harness; see "Until then")
- **Affects:** `next/packages/testing/src/wechat/fake-gateway.ts` (`createTransaction`),
  `next/packages/testing/src/wechat/fake-gateway.test.ts`

## What is wrong

WeChat Pay v3 answers the four create endpoints differently:

| endpoint                           | real answer                               |
| ---------------------------------- | ----------------------------------------- |
| `POST /v3/pay/transactions/jsapi`  | `{ "prepay_id": "…" }`                    |
| `POST /v3/pay/transactions/app`    | `{ "prepay_id": "…" }`                    |
| `POST /v3/pay/transactions/native` | `{ "code_url": "weixin://…" }`            |
| `POST /v3/pay/transactions/h5`     | `{ "h5_url": "https://wx.tenpay.com/…" }` |

The fake matches all four with one regex (`/^\/v3\/pay\/transactions\/(jsapi|h5|native|app)$/`,
line ~406) and `createTransaction` answers every one with `{ prepay_id }`, both on a fresh create
(~510) and on the "same order, tap pay twice" path (~495).

`core/src/wechat/wechat.pay.ts` `createH5Transaction` reads `h5_url` (~373) and, correctly, throws
`PAYMENT_STATE_UNKNOWN` `{ reason: 'no-h5-url' }` when it is missing. So against the fake, a
shopper on the H5 build can never start a payment: the cashier's 立即支付 is always an error. No
unit or integration test caught this, because none drives an H5 create through the fake end to end.
`native` has the same gap (`code_url`), but nothing calls it today.

## Suggested fix

In `createTransaction`, answer by trade type:

- `h5`: `{ h5_url }`. Point it at a page the fake serves itself, for example
  `GET <fake>/h5-cashier?out_trade_no=…`. That page 302s to the `redirect_url` query parameter
  when there is one, the way WeChat's cashier returns the shopper, and otherwise answers a plain 200. A `FakeWechatGatewayOptions.h5CashierUrl` override is welcome but not needed.
- `native`: `{ code_url: 'weixin://wxpay/bizpayurl?pr=<random>' }`.
- `jsapi` / `app`: unchanged.

Paying stays the test's job, through `completePayment(outTradeNo)` / the notify builder. The fake
cashier page must not settle anything by itself, or tests lose control of the paid-vs-unpaid timing.

A test in `fake-gateway.test.ts`: an H5 create answers a signed `{ h5_url }` with no `prepay_id`,
and a repeat create of the same unpaid order answers `h5_url` again.

## Until then

`next/e2e/storefront/src/h5-pay-shim.ts` sits between the app and the fake. It rewrites the one H5
create answer into `{ h5_url: <control>/h5-cashier?out_trade_no=… }` and re-signs it with the
fake's own platform key, so the app's response-signature check still runs for real.
`next/e2e/storefront/src/gateway-control.ts` serves `/h5-cashier`. When this CR lands:

1. delete `h5-pay-shim.ts`;
2. in `scripts/serve.ts`, pass `gatewayApiUrl: gateway.url` (today `shim.url`) to the seed, so
   `paymentConfig` points straight at the fake;
3. drop the `/h5-cashier` handler from `gateway-control.ts`, if the fake serves its own.

The cashier journey in `specs/cart-checkout-pay.spec.ts` should pass unchanged.
