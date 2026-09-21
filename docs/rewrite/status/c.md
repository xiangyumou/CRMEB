# Stream C — Payment and refund

Branch `rewrite/ws-c-payment`, worktree `../CRMEB-wt/ws-c`.
Domains: `payment`, `refund`, `wechat` (the first-party WeChat client, brief name `wechat/core`).

---

## Contracts ready

**Yes — commit `contracts(c): …`.** `pnpm --filter @shop/contracts check:examples` →
`contracts: 47 route(s) OK, every example parses.` (18 of those were already there; 29 are mine.)

Files:

- `packages/contracts/src/payment/{schemas,errors}.ts`
- `packages/contracts/src/payment/payment.storefront.contract.ts` — 2 routes
- `packages/contracts/src/payment/payment.webhook.contract.ts` — 2 routes
- `packages/contracts/src/payment/payment.admin.contract.ts` — 9 routes
- `packages/contracts/src/refund/{schemas,errors}.ts`
- `packages/contracts/src/refund/refund.storefront.contract.ts` — 7 routes
- `packages/contracts/src/refund/refund.admin.contract.ts` — 7 routes

### Route table

| Route id | Method + path | Auth / permission |
|---|---|---|
| `payment.start` | POST `/api/v1/orders/:id/payments` | user |
| `payment.status` | GET `/api/v1/payments/:outTradeNo` | user |
| `payment.wechatNotify` | POST `/api/v1/webhooks/wechat-pay` | webhook |
| `payment.wechatRefundNotify` | POST `/api/v1/webhooks/wechat-refund` | webhook |
| `payment.adminAttemptList` | GET `/admin-api/payment-attempts` | `payment:attempt:read` |
| `payment.adminExceptionList` | GET `/admin-api/payment-exceptions` | `payment:exception:read` |
| `payment.adminExceptionDetail` | GET `/admin-api/payment-exceptions/:id` | `payment:exception:read` |
| `payment.adminExceptionRefund` | POST `/admin-api/payment-exceptions/:id/refund` | `payment:exception:handle` |
| `payment.adminExceptionIgnore` | POST `/admin-api/payment-exceptions/:id/ignore` | `payment:exception:handle` |
| `payment.adminExceptionRecheck` | POST `/admin-api/payment-exceptions/:id/recheck` | `payment:exception:handle` |
| `payment.adminCapitalFlowList` | GET `/admin-api/capital-flows` | `payment:flow:read` |
| `payment.adminCapitalFlowSummary` | GET `/admin-api/capital-flows/summary` | `payment:flow:read` |
| `payment.adminEffectList` | GET `/admin-api/payment-effects` | `payment:effect:handle` |
| `payment.adminEffectRetry` | POST `/admin-api/payment-effects/:id/retry` | `payment:effect:handle` |
| `refund.reasons` | GET `/api/v1/refund-reasons` | public |
| `refund.applicableItems` | GET `/api/v1/refunds/applicable-items/:orderId` | user |
| `refund.apply` | POST `/api/v1/refunds` | user |
| `refund.myList` | GET `/api/v1/refunds` | user |
| `refund.myDetail` | GET `/api/v1/refunds/:id` | user |
| `refund.cancel` | POST `/api/v1/refunds/:id/cancel` | user |
| `refund.submitReturnShipment` | POST `/api/v1/refunds/:id/return-shipment` | user |
| `refund.hide` | DELETE `/api/v1/refunds/:id` | user |
| `refund.adminList` | GET `/admin-api/refunds` | `refund:request:read` |
| `refund.adminDetail` | GET `/admin-api/refunds/:id` | `refund:request:read` |
| `refund.adminApprove` | POST `/admin-api/refunds/:id/approve` | `refund:request:review` |
| `refund.adminReject` | POST `/admin-api/refunds/:id/reject` | `refund:request:review` |
| `refund.adminReceiveReturn` | POST `/admin-api/refunds/:id/receive-return` | `refund:request:execute` |
| `refund.adminRemark` | POST `/admin-api/refunds/:id/remark` | `refund:request:write` |
| `refund.adminRetry` | POST `/admin-api/refunds/:id/retry` | `refund:request:execute` |

### Things other streams must read

- **The webhooks declare no `body` schema.** A v3 signature covers the exact
  request bytes; `handle()` consumes the stream to parse a declared body, so
  the route file reads `ctx.request.text()` itself. The decrypted envelope
  shape is exported as `wechatNotifyEnvelope` from `contracts/payment/schemas`.
- **`refund.apply` takes no amount.** Lines plus quantities in, money computed
  by the service from the frozen order lines. Anything that sends an amount is
  a security bug, not a convenience.
- **`payment.start` returns `alreadyPaid: true`** with `jsapi: null` instead of
  a second payment intent when the order is already settled (CLIENT-001).
- The JSAPI parameter object keeps WeChat's own key spelling (`timeStamp`,
  `nonceStr`, `package`, `signType`, `paySign`, plus `appId`) because
  `template/uni-app/utils/wechatPayment.js` forwards it verbatim and
  `tests/static/wechat-payment-test.mjs` asserts that exact key set.
  `signType` is the literal `'RSA'`: v2's MD5 is not ported.

---

## wechat/core ready

**Interface published for E1 and E2.** Lives at `packages/core/src/wechat/`,
imported as `@shop/core/wechat`. Implementation lands with the rest of this
stream; the shapes below are frozen now so E1 and E2 can code against them.

```ts
export type WechatApp = 'oa' | 'mini';

/** Everything non-payment: identity, tokens, messages. */
export interface WechatCoreClient {
  /** OA web OAuth `sns/oauth2/access_token`. */
  oaCodeExchange(code: string): Promise<{
    openid: string;
    unionid?: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    scope: string;
  }>;

  /** OA `sns/userinfo`, only meaningful for a `snsapi_userinfo` token. */
  oaUserInfo(args: { accessToken: string; openid: string }): Promise<{
    openid: string;
    unionid?: string;
    nickname?: string;
    avatarUrl?: string;
  }>;

  /** Mini-program `sns/jscode2session`. */
  miniCode2Session(code: string): Promise<{
    openid: string;
    unionid?: string;
    sessionKey: string;
  }>;

  /**
   * The app-level access token, cached in Redis with a **single-flight** lock:
   * concurrent callers on one node share a promise, concurrent nodes contend on
   * `SET key value NX PX`, and the loser re-reads the cache rather than asking
   * WeChat again. Refreshed 5 minutes before expiry.
   */
  accessToken(app: WechatApp): Promise<string>;

  /** Drops the cached token. Called automatically on a 40001/42001 and then retried once. */
  invalidateAccessToken(app: WechatApp): Promise<void>;

  /** OA template message. Returns the failure instead of throwing so an effect can park it. */
  sendTemplateMessage(input: {
    touser: string;
    templateId: string;
    url?: string;
    miniprogram?: { appid: string; pagepath: string };
    data: Record<string, { value: string; color?: string }>;
  }): Promise<WechatSendResult>;

  /** Mini-program subscribe message. */
  sendSubscribeMessage(input: {
    touser: string;
    templateId: string;
    page?: string;
    miniprogramState?: 'developer' | 'trial' | 'formal';
    data: Record<string, { value: string }>;
  }): Promise<WechatSendResult>;

  /** Escape hatch: a signed, token-bearing call to `api.weixin.qq.com`. */
  call<T>(app: WechatApp, req: {
    method: 'GET' | 'POST';
    path: string;
    query?: Record<string, string>;
    body?: unknown;
  }): Promise<T>;
}

export interface WechatSendResult {
  ok: boolean;
  /** WeChat's own `errcode`; `0` on success. */
  errcode: number;
  errmsg: string;
  msgid?: string;
}
```

**The pay client is separate** (`WechatPayClient`), because it uses a different
host, a different signature scheme and a different credential set, and because
E1/E2 must not be able to reach it by accident:

```ts
export interface WechatPayClient {
  createJsapiTransaction(input: PayCreateInput): Promise<{ prepayId: string }>;
  createH5Transaction(input: PayCreateInput & { clientIp: string }): Promise<{ h5Url: string }>;
  /** `null` = ORDERNOTEXIST. Anything unverifiable throws, never resolves to "closed". */
  queryTransaction(outTradeNo: string): Promise<GatewayTransaction | null>;
  /** Throws `PAYMENT_STATE_UNKNOWN` unless the gateway *confirmed* the close. */
  closeTransaction(outTradeNo: string): Promise<void>;
  createRefund(input: RefundCreateInput): Promise<GatewayRefund>;
  queryRefund(outRefundNo: string): Promise<GatewayRefund | null>;
  /** Verifies signature + timestamp window, then AEAD-decrypts. Throws on any doubt. */
  verifyNotification(args: {
    headers: Record<string, string | null>;
    rawBody: string;
  }): Promise<{ notifyId: string; eventType: string; resource: Record<string, unknown> }>;
  /** The `wx.requestPayment` payload, signed with the merchant key. */
  jsapiPayParams(args: { appId: string; prepayId: string }): JsapiPayParams;
  /** False when the config group is incomplete; every caller checks it first. */
  readonly configured: boolean;
}
```

Notes E1/E2 need:

- `WechatCoreClient` is obtained with `getWechatClient(ctx)`; it reads its
  credentials from the `wechat` config group (below) and caches per `mchId`/
  `appId`, so a config change takes effect on the next request.
- Every send returns a result object rather than throwing on a WeChat error
  code, because these calls run behind the effects ledger and a thrown error
  there costs a retry with no diagnosis. A *transport* failure still throws.
- TLS verification is always on. There is no toggle and no CA-bundle override
  in the admin UI (TLS-001).

### Config groups

`wechat` (owned here, read by E1/E2) and `payment` (owned here). Both are
declared with `defineConfigGroup`; secret fields carry `secret: true` so the
admin form sends an "is set" flag and only accepts a retyped value.

| Group | Keys |
|---|---|
| `wechat` | `oaAppId`, `oaAppSecret`*, `oaToken`*, `oaAesKey`*, `miniAppId`, `miniAppSecret`* |
| `payment` | `mchId`, `apiV3Key`*, `certSerial`, `merchantPrivateKey`*, `platformPublicKeyId`, `platformPublicKey`, `notifyBaseUrl`, `apiBaseUrl`, `payExpiryMinutes` |
| `refund` | `returnName`, `returnPhone`, `returnAddress`, `afterSaleDays` |

`*` = secret, write-only. `apiBaseUrl` is in the schema but **not** on the
admin form: tests point it at the fake gateway, and an operator must not be
able to re-point the payment host by hand (TLS-001).

---

## Decisions (binding for this stream)

1. **The order vocabulary is the column's.** `ORDER_STATUSES` now reads
   `['pending_payment','paid','shipped','received','completed','cancelled','refunded']`,
   which is the `orders_status` enum exactly, so there is no mapping layer
   anywhere. (`CR-1-c`, resolved: the port was changed rather than the column.)
2. **The two-call cancel protocol.** Cancelling an order is two steps and the
   order matters: `closeOrderPayments(ctx, orderId)` **outside** any transaction
   (it talks to WeChat), then, inside the cancelling transaction with the order
   row locked, `ensureNoOpenAttempts(tx, orderId)` again. Only `closed` allows a
   release; `paid` means the money arrived and the order must live; `unknown`
   means nothing may be released at all. A caller that skips the first call will
   block forever on the second, which is the safe failure. Filed for B1 as
   `CR-7-c`; meanwhile `payment.closeExpiredPayments` runs at `:01` of every
   five minutes, two minutes ahead of B1's `:03` auto-cancel sweep, so the
   attempt is already final when B1 arrives.
3. **`wechat/core` lives at `packages/core/src/wechat/`, not
   `packages/core/src/wechat/core/`.** The `boundaries/core-cross-domain`
   ESLint rule resolves a cross-domain import against `<domain>/index.ts`, and a
   nested `wechat/core/index.ts` is not reachable under that rule. E2's
   `wechat/oa` work therefore lands as sibling files in the same folder, which
   the rule treats as one domain. **The rule also applies to test files**, so a
   test that needs another domain's config must import it from that domain's
   `index.ts`.
4. **Config groups live in the domain folder**, `core/src/payment/payment.config.ts`,
   `core/src/refund/refund.config.ts` and `core/src/wechat/wechat.config.ts`,
   not in `core/src/system/config/` as CONVENTIONS' table says — that path is
   F1's domain and writing there would break path ownership. Filed as `CR-2-c`.
5. **`openid` may be supplied in the `payment.start` body**, but a bound
   `wechat_identities` row always wins (`findOpenid(db, userId, app)`, exported
   from `@shop/core/wechat` for E1). The attempt is created with
   `payerUserId = ctx.actor.id` regardless, so a crafted openid cannot make
   somebody else's payment.
6. **The "effects needing a human" console is `/admin-api/payment-effects`**,
   filtered to `scope in ('payment','refund','order')`, rather than a generic
   `/admin-api/effects`. The effects table is platform-owned; one domain should
   not claim the whole resource. **Retrying an effect re-queues it** (status back
   to `pending`, attempts reset) rather than running it inline, so the admin
   request never waits on WeChat.
7. **Refund freight rule:** freight is refundable only while
   `orders.fulfillment_status = 'unfulfilled'`, and only on a request that
   covers every remaining unrefunded line. Partial-line refunds never carry
   freight.
8. **No transfer endpoint.** The legacy `handleTransferNotify` ran without
   signature verification; there is no successor route at all.
9. **A repeated `payment.start` that disagrees is refused, not corrected.** The
   attempt's driver, merchant, app, channel, amount and payer are immutable; an
   identical replay returns the same intent, anything else raises
   `PAYMENT_ATTEMPT_CONFLICT` (409, 请人工核对后处理). The stored row is what the
   gateway was told, so it wins.
10. **The merchant on the attempt is checked before every gateway call**
    (PAYC-005). If `payment_attempts.mch_id` no longer equals the configured
    `mchId`, the close and the query both refuse without calling WeChat and the
    attempt goes to `unknown` with 支付商户信息不一致，请人工核对后处理. Asking the
    wrong merchant would produce a "no such order" that reads like a confirmed
    negative.
11. **A notification with no usable amount is parked, not retried.** A body
    WeChat really signed can still carry an absent, zero or unparseable amount.
    It is acknowledged and recorded as `ignored: invalid amount`: there is
    nothing to book and nothing to refund, and a 500 would ask WeChat to
    redeliver the identical bytes forever.
12. **The refund domain owns the refund webhook.** `POST
    /api/v1/webhooks/wechat-refund` is routed to `refund.handleRefundNotify`,
    not to the payment domain, because everything it touches
    (`refunds`, `refund_items`, the order roll-up) is the refund domain's. It
    verifies the signature before anything else, exactly like the payment one.
13. **Restock on refund is legacy-faithful:** only lines with
    `shippedQuantity === 0` go back, through
    `StockPort.release(tx, orderId, lines, { committed: true, refundId })`. A
    shipped unit is still refundable as *money*; the parcel is the shop's
    problem, not the ledger's.
14. **Config text fields are plain `z.string()` again.** They briefly went
    through a `configText` preprocess because `config.repo.ts` parsed the
    `jsonb` column twice and an all-digit setting (商户号, a phone number) came
    back as a *number*. `CR-6-c` fixed that in `@shop/db`, so the preprocess is
    gone from all three groups; the proof moved from the schema — where it could
    only assert the workaround — to a real database round trip in
    `payment.int.test.ts` and `refund.int.test.ts`.
15. **Domains register themselves from the worker job files.** Nothing in either
    app calls `registerPaymentDomain()` / `registerRefundDomain()`, so an effect
    claimed before its handler exists is settled as `unknown` permanently. The
    four sweeps call it at module scope, and `jobs.gen.ts` imports every job at
    boot. Filed as `CR-8-c` for a generated `registerAllDomains()`.
16. **The return address a buyer is shown is frozen on the refund row.**
    `adminApprove` writes `refunds.return_address` at the approval that first
    asks the buyer to ship — the operator's own input wins, the `refund` config
    group is the fallback, and a re-approval never overwrites an address that is
    already there. Every read afterwards comes from the row. Editing 售后设置
    later changes what the *next* buyer is told, never what this one was.
17. **`retryEffect` un-parks `unknown` only, and resets `attempts` to 0.**
    `CR-4-c` asked for `unknown | failed → pending`, but `EFFECT_STATUSES` is
    `pending | done | unknown` — a failing handler is either retried (`pending`,
    still the dispatcher's, and re-queueing it would fight the lease) or parked
    (`unknown`). The guard is the named constant `RETRYABLE_EFFECT_STATUSES`
    so a future `failed` joins it and nothing else changes. Resetting the
    counter is deliberate: an operator who fixed the cause wants the full
    backoff ladder back, not a row that parks again on its first hiccup.
18. **Approving a 仅退款 takes its units out of fulfilment at once** (B2's
    decision 1). `order_items.refunded_quantity` is *derived*, not incremented:
    one statement re-reads the refunds that count against the line — everything
    settled, plus every open `refund_only` — and writes the sum under the mirror
    of B2's dispatch bound (`counted <= quantity - shipped_quantity` for a line
    that has not shipped). Deriving makes it idempotent at settlement and makes
    release automatic: a `refund_only` the gateway refuses drops out of the set
    and the units go back to the warehouse with no compensating update. Losing
    the race means the goods shipped first, and the approval is refused with
    `REFUND_LINE_ALREADY_SHIPPED` — the request is a return now, and the
    operator says so rather than the system guessing.
19. **The staff console is the admin services, not a copy of them.**
    `registerRefundDomain()` registers `adminList` / `adminDetail` /
    `adminApprove` / `adminReject` behind B2's `StaffRefundPort`, permission
    checks and all, so a shop assistant reviewing on a phone goes through
    exactly the code an operator does.
20. **`adminFlowSummary`** answers the 资金流水 console's totals with one
    boot. Filed as `CR-8-c` for a generated `registerAllDomains()`. **Resolved:**
    `@shop/core/domains` is generated and imported once by each app at bootstrap,
    and the stop-gap in the four job files is removed.
16. **`adminFlowSummary`** answers the 资金流水 console's totals with one
    aggregate over the *whole* filter (`repo.summariseCapitalFlows`) rather than
    summing a page, and `netAmount` is allowed to be negative — a day of refunds
    is a real thing that happens.

## New dependencies

None. `wechat/core` and the Pay v3 client are built on `node:crypto` and the
global `fetch`, as the brief requires. `next/pnpm-lock.yaml` is untouched.

## CRs filed

| CR | Subject | State |
|---|---|---|
| `CR-1-c` | `ORDER_STATUSES` vs the `orders_status` enum | resolved (port changed) |
| `CR-2-c` | config group file location vs the CONVENTIONS table | resolved |
| `CR-3-c` | fake WeChat gateway business rules | resolved (built here) |
| `CR-4-c` | `/admin-api/payment-effects` needs a paginated effects read, and un-parking an `unknown` effect belongs upstream | applied (delegated to C; `listEffects` / `retryEffect` now in `effects/`) |
| `CR-5-c` | `refunds.return_address jsonb` — the buyer's return address is frozen on approval and the column is missing | applied (column exists; address frozen at approval) |
| `CR-6-c` | `config.repo.ts::loadGroup` double-parses `jsonb`, so numeric settings come back as numbers | applied (fixed in `@shop/db`; workaround removed) |
| `CR-7-c` | `cancelOrder` must call `closeOrderPayments` before it opens the cancelling transaction | open (B1) |
| `CR-8-c` | nothing calls `register<Domain>Domain()` in either app; asks for a generated `registerAllDomains()` | applied (platform) — `@shop/core/domains` |

## What other streams must know

- **B1** — the two-call cancel protocol (decision 2, `CR-7-c`), and
  `ensureNoOpenAttempts` is database-only by design: it must never make a
  network call while holding the order's row lock.
- **B2** — a refund settles `onOrderRefunded` and can end an order
  (`status = 'refunded'`); fulfilment must treat a refunded line as gone.
  Freight comes back only while `fulfillment_status = 'unfulfilled'`.
  `StaffRefundPort` is registered from `registerRefundDomain()`. Two things B2
  should pick up: `staffRefundReview` may now raise
  `REFUND_LINE_ALREADY_SHIPPED` and its `errors` list does not say so (B2's
  file, left alone), and the staff routes stay `INTERNAL` in the **web** app
  until `CR-8-c`'s `registerAllDomains()` lands, because nothing there calls
  `registerRefundDomain()` — only the worker jobs do.
- **D** — the per-activity stock layers (presale, group buy) are the
  `StockPort` implementation's, not the refund domain's: it calls the port once
  with the order's unshipped lines and `{ committed: true, refundId }`. Legacy
  invariants REFUND-002 and REFUND-003 are therefore D's rows.
- **E1** — `findOpenid(db, userId, app)` from `@shop/core/wechat` is what binds
  a user to an openid; `payment.start` prefers it over anything in the request
  body.
- **E1 / E2** — `wechat/core` is the interface above, obtained with
  `getWechatClient(ctx)`. Sends return a result object instead of throwing on a
  WeChat error code. The pay client is deliberately separate.

## Verification

`pnpm gen typecheck lint test:unit test:int build` from `next/`, plus
`check:examples` — see the final report for the verbatim output.

## Progress

- [x] Contracts (29 routes), `check:examples` green
- [x] `wechat/core` client + crypto (`wechat.crypto.test.ts`, 38 vectors)
- [x] payment domain (repo, service, effects, jobs)
- [x] refund domain (repo, rules, service, effects)
- [x] route files — one per contract, all 29
- [x] admin pages, menu, permissions (交易 group: 售后单 / 异常支付 / 支付记录 /
      资金流水 / 待处理任务)
- [x] worker jobs (`payment.closeExpiredPayments` `1/5 * * * *`,
      `payment.reconcileStalePayments` `2/5 * * * *`,
      `refund.reconcileStaleRefunds` `4/5 * * * *`,
      `payment.recheckExceptionRefunds` `4/10 * * * *`)
- [x] invariants rows (TLS-001…006, PAYC-001…005, PAY-001…007, GATEWAY-001/002,
      CLIENT-001, REFUND-001/004/005/006, the C half of QUEUE-003/004/005/010/011;
      REFUND-002 and REFUND-003 handed to D with the reason in the cell)
