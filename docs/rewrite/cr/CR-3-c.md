# CR-3-c — the fake WeChat gateway needs its `TODO(C)` business rules

**Stream** C · **Target** `next/packages/testing/src/wechat/fake-gateway.ts` (orchestrator-owned) · **Severity** high for C's test coverage

**Status: resolved — the first option was taken.** The dispatch handed
`packages/testing/src/wechat/**` to stream C, and all five `TODO(C)` markers were
implemented in the shipped gateway itself (`2a5edc22`), not in a wrapper. The
"Meanwhile" below is obsolete: `extendFakeWechatGateway` and
`packages/core/src/payment/payment.testkit.ts` were deleted rather than adopted —
a testkit file is exempt from neither the `@shop/db/schema/*` deny rule (only
`*.repo.ts` and `*.test.ts` are) nor `boundaries/core-cross-domain`, so a refund
test could not have imported one from the payment domain anyway. Fixtures now
live in each `*.int.test.ts`.

A later addition, `2e5eeaaa`, gave the gateway `signTransactionNotification` and
`signRefundNotification`, which return `{ headers, rawBody }` for a notification
without delivering it. A concurrency test needs the signed bytes in hand: two
real HTTP posts are serialised by the listener before they ever reach the
database, so a duplicate-callback race run over HTTP proves nothing. `deliver`,
`postNotify` and `postRefundNotify` were refactored onto the same three internal
helpers (`sign`, `transactionEnvelope`, `refundEnvelope`), so the bytes a test
holds are the bytes the gateway would have sent.

`packages/testing/src/wechat/fake-gateway.ts` carries five `TODO(C)` markers.
Each is load-bearing for an invariant stream C must prove:

| TODO                                                        | Needed for                                   |
| ----------------------------------------------------------- | -------------------------------------------- |
| duplicate `out_trade_no` → `ORDERPAID` / `ORDER_CLOSED`     | PAYC-003, PAYC-004                           |
| close of a `SUCCESS` transaction must fail with `ORDERPAID` | risk matrix §4 "payment vs cancel", PAYC-001 |
| partial refunds, refund notifications, `NOTENOUGH`          | REFUND-005/006/007                           |
| a real encrypted `/v3/certificates` payload                 | TLS-002, TLS-003, TLS-004                    |
| `time_expire` honoured, mchid/appid validated               | GATEWAY-001, PAYC-005                        |

The brief originally assigned `packages/testing/src/fake-wechat/**` to this
stream; the orchestrator's dispatch instead reserves the whole `packages/testing`
tree and asks for a CR.

## Asked for

Either hand `packages/testing/src/wechat/**` to stream C, or apply the extension
this stream has written and tested as
`packages/core/src/payment/payment.testkit.ts` (`extendFakeWechatGateway`), which
wraps the shipped gateway's `route` handler and adds exactly the rules above
without changing its signature or its keys.

## Meanwhile

`extendFakeWechatGateway` in `packages/core/src/payment/payment.testkit.ts` is
applied by every integration test in this stream. It is additive: it never
changes a code path the shipped gateway already implements, so adopting the
upstream version later is a one-line deletion.
