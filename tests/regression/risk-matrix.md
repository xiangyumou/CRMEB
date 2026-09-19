# Core business risk matrix (2026-09-19)

Independently rebuilt for this round: the mapping below walks each business
entry to the state it changes, the resources it moves, the external calls it
makes and the test evidence that exists today. It does not inherit the
checkmarks of `cases.md`; every "covered" verdict was confirmed by reading the
named test file and its assertions. Verdicts: **covered** (executable
assertions verified), **thin** (something exists but does not prove the
invariant), **new** (test added this round), **manual** (operator acceptance,
not automatable).

Key for the evidence column: `File::method` in `tests/regression/Cases/`,
or a static guard / shell script. IDs in brackets are this round's defect
entries (`defects.md`, "Order/payment/refund launch blockers").

## 1. Products and cart

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Product on/off shelf (`is_show`) | storefront lists hide/show | none | none | sellable fixture uses `is_show=1` in StorefrontOrderFlowTest; offline product not exercised | thin → new (section 四: offline product refuses order) |
| SKU swap between confirm and create | order computed price vs cart mismatch | none | none | none | new [PRICE-005 in section 四] |
| Quantity boundaries (decimal, zero) | computed price arithmetic | none | none | OrderPricingBoundaryTest::testOrdinaryItemQuantityUsesTwoDecimalArithmetic | covered |
| Invalid/expired cart rows at create | cart rows with dead product refs | none | none | none | new (section 四) |
| Stock race on the last unit | `store_product.stock`, `sales` | stock row | none | InventoryTest::testLastItemCanOnlyBeDeductedOnce (two processes, conditional update) | covered |

## 2. Pricing and order creation

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Server-side recompute over HTTP | order priced on the server | none | none | StorefrontOrderFlowTest (confirm → computed → create, stock asserted) | covered |
| Coupon threshold boundary | coupon applies / refused | none | none | OrderPricingBoundaryTest (threshold equal and one cent above) | covered |
| Freight threshold | postage charged / waived | none | none | OrderPricingBoundaryTest (fixed freight, inclusive free shipping) | covered |
| Multi-item coupon split | per-row `cart_info` prices | none | none | OrderPricingTest::testMultiItemCouponSplitReturnsCartRows + PRICE-004 | covered |
| Double submit of the same order key | second create refused | no second order / stock | none | creation lock exists (`CacheService::lock('orderCreate…')`) but never tested | thin → new (section 四) |
| Create transaction failure mid-way | coupon redeem + order + stock all-or-nothing | coupon, order, stock rows | none | ORDER-004 (spent coupon refused before write); multi-SKU second-item failure untested | thin → new |
| Order detail save failure after insert | order row without finalized cart info | orphan order row | none | PRICE-004 regression test covers the crash shape, not the rollback | thin → new |

## 3. Coupons

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Claim limits (per user, total) | `store_coupon_issue_user`, `remain_count` | coupon stock | none | COUPON-003 ordinary claim decrements `remain_count`; last-coupon race untested | thin → new (section 四) |
| Claim a retired member coupon | refused before write | none | none | COUPON-001/002 (list hidden, claim refused, `remain_count` unchanged) | covered |
| Ownership / cross-user use | conditional redeem keyed on uid | coupon row | none | COUPON-005 (wrong holder, used, failed, expired → 0 rows) | covered |
| Expiry boundary at redeem | expired coupon unusable | coupon row | none | COUPON-005 (expired, not-yet-valid) | covered |
| Concurrent redeem of one coupon | single winner | coupon row | none | COUPON-006 (two processes, one winner) | covered |
| Failed order returns the coupon | coupon status restored in the same tx | coupon row | none | QUEUE-006/007 (rollback both directions) | covered |
| Cancel returns the coupon once | `coupon_back` status row once | coupon row | none | QUEUE-009 (two cancellations, one release) | covered |

## 4. Payment and cancellation

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Payment creation `/api/order/pay` | attempt row, order `order_id`/`pay_uid` | attempt row | gateway create | none — the entry itself was never driven over HTTP | new [PAY-007/008] |
| Payer swap (`type=1`, `pay_uid`) | new merchant order number, attempt context | attempt row | gateway create | none | new [PAY-008] |
| Attempt context immutability + config identity | attempt refuses overwrites / mismatched mch | attempt row | none | none | new [PAY-008] |
| Shared order lock (pay vs cancel) | pay cannot start/finish against a committing cancel | attempt, order rows | gateway create, query, close | none — `pay()` holds no DB transaction today | new [PAY-007] |
| Paid query result standard | `{state, trade_no, …}` fresh from the query | attempt row | gateway query | QueueTest asserts ordering but with `settleAttempt` itself mocked; trade_no freshness untested | thin → new [PAY-009] |
| Paid discovery completes local confirmation | order marked paid + fulfillment committed before "无法取消" | order, pink, effects | gateway query | QUEUE-005 keeps the order alive but never confirms it locally | thin → new [PAY-009] |
| Unknown query result keeps resources | attempt untouched, order open | none | gateway query | QUEUE-004 (unknown → nothing released) | covered |
| Duplicate / late notification | paid once, second ack idempotent | order, attempt, effects | notify parse | PaymentNotifyTest (two callbacks pay once; repeat no-op) | covered |
| Notification for a cancelled order | exception payment persisted, then acked | exception row | notify parse | today: non-acked, unpersisted log line only | new [PAY-011] |
| Notification with unknown trade number | exception persisted, acked | exception row | notify parse | today: silently acked, unpersisted | new [PAY-011] |
| Extra payment while one trade already paid | second real money kept as exception | exception row | notify parse | today: treated as duplicate of the first trade | new [PAY-011] |
| Manual + queue + timer cancel together | one release, one cancel flag | stock, coupon, order | gateway query | QUEUE-009 (two processes); timer path shares the entry point | covered |
| Cancel when gateway close is unconfirmed | resources retained, retry later | none | query, close | QUEUE-004 | covered |
| Close of other attempts is gateway-confirmed | attempt closed only after the gateway says so | attempt row | gateway close | today: `closeRemaining()` writes CLOSED locally without asking | new [PAY-010] |

## 5. Group buys and presale

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Presale activity window | expired unlisted | activity rows | none | SMOKE-011 / RetainedActivityTest::testPresaleExpirationOnlyUnlistsExpiredPresaleProducts | covered |
| Group create on payment | `store_pink` row inside the pay tx | pink row | none | paySuccess throws `拼团创建失败`; the failure path is untested | thin → new [FULFILL-001] |
| Group full (last slot) race | one joiner wins, loser order rolls back | pink row, order | none | `isPinkBe()`-then-save is not atomic today | new [FULFILL-001/PINK-001] |
| Group refund demotes leader | pink state recomputed once | pink rows | none | setRefundPink runs inside the refund tx; no dedicated assertion beyond REFUND-002 stock | thin → new |
| Presale cancel/restore | all four ledgers restored | advance, advance SKU, product, SKU | none | QUEUE-008 + REFUND-002/003 (deliberately different ids/SKUs) | covered |

## 6. Fulfillment and after-sale

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Delivery + receipt over HTTP | status transitions 0→1→2→3 | order rows | none | not exercised end-to-end today | new (section 四) |
| Core fulfillment atomicity | capital flow, gift coupon, virtual allocation committed with payment | flows, coupon_user, virtual rows | none | today all three run in OrderPaySuccessListener outside the pay tx | new [FULFILL-001] |
| Gift coupon issued exactly once | one coupon row per payment | coupon_user, issue_user | none | no uniqueness today; effect retry duplicates | new [FULFILL-001] |
| Virtual card claim | one card to one order, atomically | `store_product_virtual` | none | today get-then-save, no unique key, retry duplicates | new [VIRTUAL-001] |
| Refund freeze | number + amount + context frozen | refund row | none | REFUND-005/006 (number and amount replay across retries and processes) | covered |
| Refund amount mismatch on retry | refused, not silently ignored | refund row | none | today a different input amount is ignored silently | new [REFUND-007] |
| Refund cumulative limit | sum of refunds ≤ original payment | refund, order rows | gateway refund | enforced only per-row in controllers today | new [REFUND-007] |
| Refund unknown result | processing state, query by frozen number, no re-send | refund row | refund query | today: synchronous call, fail = rollback, no unknown state, `queryRefund` has zero callers | new [REFUND-007] |
| Refund completion computed by the service | `refunded_price` derived from the frozen request | refund, order rows | none | today controllers compute and pass `refunded_price` | new [REFUND-007] |
| Split order refund | child order carries the refund, sibling re-pointed | order rows | gateway refund | `equalSplit` path has no test | new (section 四) |
| Retried refund after gateway accept + local failure | same number, no double restore | stock, coupon, refund rows | refund query | REFUND-005 replays number/amount; no query-then-complete path | thin → new [REFUND-007] |

## 7. Authorization

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Cross-user order read/write | refused | none | none | AUTH-003 / OrderAuthorizationHttpTest | covered |
| Cross-user refund detail / shipment | refused | none | none | OrderAuthorizationHttpTest | covered |
| Mobile order-management roster | exactly the roster uids | none | none | AUTH-004 / OrderNoticeRosterTest | covered |
| Low-privilege admin refund endpoints | refused before write | none | none | none — admin privilege boundaries on refund are untested | thin → new (section 四) |
| Expired token | rejected by middleware | none | none | OrderAuthorizationHttpTest::testExpiredTokenIsRejectedByProductionMiddleware | covered |

## 8. Async tasks

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Effect recorded with the payment | one row per (order, event) | effect row | none | QUEUE-010 / OrderEffectTest | covered |
| Claim / redelivery filters | finished, fresh, exhausted skipped; unknown and stale claimed | effect row | none | QUEUE-011 / OrderEffectTest::testRedeliverySkips… | covered |
| Failed effect records unknown + attempts | status UNKNOWN, attempt counted | effect row | none | OrderEffectTest::testAFailedEffectIsRecordedAsUnknown… | covered |
| Effects split per event | each event retried on its own | effect rows | events fire per type | today one `pay_success` row bundles notify/print/invoice/push | new [QUEUE-012] |
| No-idempotency unknown tasks need a human | manual inspect/retry with ack | effect row | none | no reconcile command exists today | new [QUEUE-012] |
| Queue delivery failure after commit | timer re-delivers pending rows | effect rows | none | timer loop asserts nothing itself; covered indirectly by OrderEffectTest filters | thin |

## 9. Migration and deployment

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Fresh install ships reliability schema | tables + unique keys present | schema | none | MIG-015 / OrderReliabilityMigrationTest | covered |
| Upgrade adds missing objects, rerun no-op | tables/columns added idempotently | schema | none | MIG-016/017 (interrupted run completed; existing rows untouched) | covered |
| Column type / required / unique-index verification | mismatch reported, not silently accepted | schema | none | today existence-only verification | new [MIG-018] |
| Pre-checks of pending payments/refunds before upgrade | ambiguous legacy states block apply | none | none | only drop-retired.php pre-checks liabilities; order-reliability has none | new [MIG-018] |
| Before/after data snapshots | row images recorded and compared | none | none | none today | new [MIG-018] |
| Exception-payment table ships + migrates | table + unique `(mch_id, trade_no)` | schema | none | does not exist yet | new [PAY-011] |
| Health check reflects real topology | role fails when its dependency fails | none | none | docker/verify-http-stack.sh (queue, bad channel, mysql down) | covered |
| Health check cannot be masked by localhost | wrong Channel address fails from every role | none | none | workerman probe still accepts a `127.0.0.1` fallback today | new [OPS-001] |
| ready.php schema gate | missing table/column/index → 503, no credentials | none | none | verify-http-stack.sh stops MySQL; unique-index check missing today | thin → new [OPS-001] |
| Release publish refuses conflicts | existing tag with a different digest blocks before any write | none | GHCR | container.yml `publish_tag()` inline; not extracted, not locally testable | new [OPS-002] |
| Manual promotion of a verified digest | edge moves only for a matching candidate | none | GHCR | no promote workflow today | new [OPS-002] |
| Upgrade backup verified before migration | dump non-empty, gzip intact, restore-checked, isolated | none | mysqldump | normalize.sh has the pattern; no upgrade.sh for the routine path | new [OPS-003] |
| Rollback integrity | app roles pinned to one digest, refuse mixed | none | registry | rollback.sh digest checks | covered (strengthened in OPS-003) |

## 10. Client surfaces

| Entry | State change | Resource change | External calls | Evidence | Verdict |
|---|---|---|---|---|---|
| Admin/H5/MP builds | built from source, digests recorded | build.json | npm/uni | scripts/build-release.sh + verify-release.cjs (digest recompute) | covered (release step) |
| Retired endpoints stay dead | 404 over HTTP | none | none | CORE-001/002, CoreStoreAdminBoundaryTest, RouteIntegrityTest | covered |
| Payment failure / pending never rendered as success | client contract fields | none | none | static contract guards only; runtime fields untested | thin → new (section 四) |
| Retired exit entries unreachable | menu/route absent | none | none | CORE-002 + retired-code-guard.cjs | covered |
| Real WeChat pay + refund on device | end-to-end money flow | — | WeChat | — | manual |

## Verdicts for this round

- **New blockers found while building this matrix** (recorded in `defects.md`):
  PAY-007, PAY-008, PAY-009, PAY-010, PAY-011, REFUND-007, FULFILL-001,
  QUEUE-012, VIRTUAL-001, TLS-001, MIG-018, OPS-001, OPS-002, OPS-003.
- **Thin rows promoted to tests this round**: double-submit ordering, group
  failure, delivery end-to-end, claim-limit race, low-privilege admin refund,
  split-order refund, client contract fields.
- **Manual (not automatable)**: real WeChat payment/refund on a device, real
  merchant acceptance, production migration rehearsal. The automation proves
  the business invariants; it does not replace a human with a phone.
