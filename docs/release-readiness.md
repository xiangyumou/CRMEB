# Release readiness record

This record is written for the local commit below. It states what was measured,
what the measurements prove, and what they do not. The automated gate cannot
replace acceptance by a real merchant on a real device — section 5 lists exactly
which items are still open for that reason.

## 1. What was built and tested

| Item | Value |
|---|---|
| Source commit | `50cd8dd7bd3ce467484509a0854876c00ab736de` (`cleanup/retired-features`) |
| Test image | `crmeb-test` (local) — `sha256:55829506c62bba23f84d8e5469ee0d68e51f7f8b8df0ddb1be3e575699ef3d4a` |
| Image revision label | `50cd8dd7bd3ce467484509a0854876c00ab736de` (matches `git rev-parse HEAD`) |
| Frontend build | `scripts/build-release.sh` on Node 20.19.0 / npm 10.8.2, UniApp 2.0.2-5020420260813001 |
| Admin digest | `a504aa8280f067eeb430045599cd39da3e28be78d32c4b56feeb330bd1cea927` |
| H5 digest | `3b018fecaf50dbf30f50584d917e5a87a1868805e7f81c08f59c73d44e82d0e7` |
| Mini-program digest | `e519aed4466d760f7d473f9c4c610a198d38ea9d083c20dadc5a5d0006836bf1` (not publishable: no AppID configured) |
| Gate command | `sh scripts/check-maintenance.sh crmeb-test` — exit 0 |
| Core regression suite | 254 tests, 3530 assertions, 0 failures, 0 errors, 0 skipped |
| Deployment rule suites | 8 publish checks against a local registry + 7 upgrade/rollback checks against a disposable stack + 10/10 concurrency-stability repetitions + 10/10 mutation targets detected |
| Working tree | The image was built from this commit with a clean tree; `.build/release/build.json` names the same commit. |

The revision label alone does not prove content. What makes the claim
verifiable here: the frontend was rebuilt for this exact SHA, `build.json`
inside the image is compared by the Dockerfile against `VCS_REF` (so an image
carrying a stale frontend refuses to build at all), the gate command took the
image name and re-derived the revision from it, and the working tree was clean
when the image was built.

This record is itself a documentation file, so it lands in a docs-only commit
after the revision it names. That is checkable rather than assumed:

```sh
git diff --name-only <recorded SHA>..<commit with this file> | grep -vE '^(docs/|README|tests/.*\.md$)'
# expect no output: no source, schema, frontend or test code differs
```

## 2. What the gate covers

| Layer | Command | Result |
|---|---|---|
| PHPUnit (unit + DB integration + HTTP + concurrency + fixed-seed state sequence) | `docker/run-regression.sh` inside the gate | 254 green |
| PHP syntax | `php -l` over `app`, `crmeb`, `route`, `upgrade` in the release image | green |
| Static guards | core-store-front, admin-api-contract, retired-code-guard, install-sql-guard, model-relation-guard, php-symbol-guard, event-payload-guard, deployment-topology-guard, release-pipeline-guard, verify-release-test, wechat-payment-test | green |
| Publish rules against a local registry | `tests/deployment/publish-release.sh` | 8/8 |
| Upgrade/rollback rules against a real disposable stack | `tests/deployment/upgrade-rollback.sh` | 7/7 |
| Full HTTP topology (real MySQL, Redis, php-fpm, workerman, queue, timer, nginx) | `docker/verify-http-stack.sh` | passed |
| Concurrency stability (two orderings, ten repetitions each) | `tests/deployment/concurrency-stability.sh` | 10/10 (42 tests, 2440 assertions per repetition) |
| Test strength (directed mutation, temporary copy only) | `tests/deployment/mutation-check.sh` | 10/10 protections detected |
| Frontend build | `scripts/build-release.sh` (Node 20.19.0) | rebuilt for this SHA |

The regression suite runs on MySQL 8 (with `ONLY_FULL_GROUP_BY`), Redis 5,
PHP-FPM and Nginx, uses production routing, middleware and JWT, and keeps the
network internal so no payment gateway can be reached. Cross-process tests are
real processes over a shared MySQL, including a race worker that drives the real
controller entries.

## 3. Defects found, proved and fixed in this round

Every entry below was observed failing on the pre-existing code first, through a
business assertion (a response, a persisted row, a stock or money value) — never
a missing class or an environment error. The pre-fix evidence is recorded in
`tests/regression/defects.md`; the case ids are in `tests/regression/cases.md`.

| Defect | Severity | What was wrong | Pre-fix failing evidence | Fix commit |
|---|---|---|---|---|
| PAY-007 | P1 | Payment creation ran with no transaction and an inert `FOR UPDATE`; a cancellation could commit while a create was in flight, leaving a collectible gateway payment on a cancelled order. A lost create response was treated as "never happened". | `PaymentConcurrencyTest::testNoCollectibleGatewayPaymentSurvivesACancelledOrder` — "a cancelled order ended up with a collectible gateway payment (open)"; `testACreateResponseTimeoutKeepsTheAttemptAsUnknown` — "Failed asserting that 0 is identical to 3" | `08c8f4f7` |
| PAY-008 | P1 | The payment attempt's driver, merchant, app, channel, amount and payer were overwritten on every re-record, and nothing compared the recorded identity with the configuration. | `testPaymentAttemptContextIsImmutable` — "a changed amount must not overwrite the recorded attempt"; `testConfigIdentityMismatchStopsCancellationForManualHandling` | `08c8f4f7` |
| PAY-009 | P1 | A payment discovered during cancellation was not confirmed locally: the order stayed unpaid and the fresh trade number from the query was discarded. | `QueueTest::testAGatewayPaymentFoundDuringCancellationKeepsTheOrderAlive` (updated to the fixed contract) | `08c8f4f7` |
| PAY-010 | P1 | `closeRemaining()` marked the other attempts closed locally without asking the gateway. | `PaymentExceptionTest::testCloseTasksReallyCloseOtherAttemptsAtTheGateway` | `1c68041a` |
| PAY-011 | P1 | A payment for a cancelled order, a second real payment, and an unmatchable trade number were only logged: no record, no alarm, nothing for an operator to act on. | `testASecondRealPaymentBecomesAPersistedException`, `testAPaymentForACancelledOrderBecomesAPersistedException`, `testAnUnmatchablePaymentIsPersistedAndAcknowledged`, `testAnExceptionPersistenceFailureAsksTheGatewayToRetry` | `1c68041a` |
| REFUND-007 | P1 | The refund froze only an amount, silently ignored a retry that asked for a different amount, read the driver and merchant from the live configuration at execution time, let the controllers compute the completion amount, and had no state for "gateway accepted, local failed". | `RefundConcurrencyTest::testARetryWithADifferentAmountIsRefused`, `testTheServiceGeneratesTheLocalCompletionFromTheFrozenRequest`, `testGatewayAcceptedWithLocalFailureIsRecoveredByQuery`, `testCumulativeRefundsCannotExceedThePaidAmount` | `9fd06a02` |
| FULFILL-001 / PAY-006 / VIRTUAL-001 | P1 | Gift coupons, capital flow, virtual allocation and invoice state were written after the payment committed, so a failure left a paid order with missing fulfillment; a retry re-ran the whole bundle; a virtual card could be handed to two orders. | `FulfillmentAtomicityTest::testAFailedGiftCouponIssueRollsTheWholePaymentBack`, `testAFailedCapitalFlowRollsThePaymentBack`, `testAFailedVirtualAllocationRollsThePaymentBack`, `testRepeatedPaymentDoesNotDuplicateLocalFulfillment`, `testExternalActionsAreRegisteredPerTarget`, `testTwoOrdersCannotClaimTheSameCard` | `967e886d` |
| TLS-001 | P1 | The WeChat v3 client disabled peer and hostname verification and never checked the `Wechatpay-Signature` of a response; the v2 application shipped `verify => false`; an undecryptable v3 notification was passed to the handler as a success. | `PaymentTransportTest::testTransportKeepsPeerAndHostVerificationOn`, `testPlatformSignatureVerificationAcceptsOnlyTrustedResponses`, `testAnUntrustedCertificateIsRejected`, `testAnUnverifiableV3NotificationIsRefused`, `testQueryAndCloseRefuseUnverifiedResponses` | `14e1735e` |
| MIG-018…022 | P1/P2 | The reliability migration verified only that tables and columns existed — not their types or the unique indexes that carry the concurrency guarantees — had no pre-check for unresolved legacy money state, and took no evidence that business rows were untouched. | `OrderReliabilitySchemaTest::testAMissingUniqueIndexIsReportedAndRecreated`, `testAWrongColumnTypeBlocksApplyBeforeAnyChange`, `testAnUnresolvedPaymentBlocksApplyUntilItIsResolved`, `testUnresolvedRefundsAndEffectsBlockApply`, `testARerunAfterInterruptionCompletesAndTouchesNoBusinessRow` | `f6ac0683` |
| OPS-001…004 | P1 | The workerman probe fell back to `127.0.0.1`, so a wrong Channel address passed its own health check while other containers were cut off; queue/timer never verified their Channel connection; `/readyz` did not check the unique indexes. | `docker/verify-http-stack.sh` (bad channel address now fails all three dependent roles; stopping the Channel server turns the queue unhealthy; dropping a unique index turns `/readyz` red) | `2015c048` |
| OPS-005…011 | P2 | Publishing rules and the upgrade procedure lived as prose or inline YAML, so nothing proved a backup was usable before a migration ran, and the deployment tag could move automatically. | `tests/deployment/publish-release.sh` (8 checks), `tests/deployment/upgrade-rollback.sh` (7 checks) | `b8dba6be`, `93e68440` |
| ORDER-004 … COUPON-008 | P2 | The last coupon could be claimed twice (read-then-write on `remain_count` and on the per-user limit). | `OrderBusinessInvariantTest::testTheLastCouponCannotBeClaimedTwice` | `f03e9835` |

Two test-infrastructure defects were also found and fixed, because a failing
test must not poison the next run: the migration test now resets the roster row
it edits (`9fd06a02`, `f6ac0683`), and the reliability tests establish their own
pre-check baseline and restore any probe column's type.

### Test strength

Two checks exist specifically to stop the suite from passing vacuously:

- **Fixed-seed state sequence** (`OrderStateSequenceTest`, four seeds in the
  suite): a randomized interleaving of real operations over three orders checks
  the invariants after every step, and a failure prints the seed and the whole
  event log so the run replays exactly with `CRMEB_STATE_SEQUENCE_SEED`.
- **Directed mutation** (`tests/deployment/mutation-check.sh`): each of ten
  protections is removed in a temporary copy of the workspace — never the
  working tree — and the matching test must fail. All ten are detected: the
  payment/cancel order lock, attempt immutability, the gateway-confirmed close,
  the refund amount freeze, the coupon remaining-count guard, the virtual-card
  atomic claim, the service-generated refund completion, TLS peer verification,
  response signature validation, and the cancelled-order payment branch.

## 4. Risk matrix completion

`tests/regression/risk-matrix.md` maps every retained business entry to its
state changes, resource changes, external calls and test evidence, with one of
four verdicts. Current state:

- Rows marked **covered** (verified by reading the named test and its
  assertions) or turned into **new** tests this round: all ten sections.
- The ten defects above closed every **new** row in sections 4, 6, 8, 9, 10;
  sections 1, 2, 3, 6 and 7 also gained the independent invariants listed in
  `cases.md` (ORDER-004…008, COUPON-007/008, AUTH-005, CLIENT-001).
- Remaining **manual** rows are the release/acceptance steps in section 5. There
  are no rows left marked "thin" that a test could have covered: each was either
  promoted to a test this round or is explicitly manual.

## 5. Still open — human verification required

The following are deliberately not claimed as covered, and are launch conditions
1 and 5:

1. **Real WeChat payment and refund** with a merchant account: a real jsapi
   payment, a real refund, and a real gateway-side retry. The suite replaces
   only the transport; the merchant application, the platform certificates and
   the real notification flow are exercised for the first time here.
2. **Real device acceptance**: a normal purchase, a group buy, a presale
   cancellation and a refund, completed on a real WeChat client, checking what
   the customer sees (payment success, refund arrival, order state).
3. **Production migration rehearsal**: `deploy/production/upgrade.sh` is tested
   against a disposable stack seeded from the install SQL, not against a copy of
   the production database. The rehearsal on real data, with a real backup, is a
   separate operation and must be run and recorded before the window.
4. **Mini-program publication**: the mini-program build is not publishable in
   this environment (no AppID), so its real payment experience is untested.
5. **Manual promotion**: moving the deployment tag is a separate, manual
   workflow requiring the candidate digest, the source commit and this record's
   acceptance id. Nothing in the automated gate promotes.

Deferred by scope decision (not blockers): permanent deletion of a retired table
that still holds rows, and the retired seckill/bargain/points/commission/member
surfaces.

## 6. Launch conditions

1. This round's blockers and the new P1 defects are closed — done, see section 3.
2. The core matrix has no unexplained gaps — done, see section 4; section 5 lists
   the manual items explicitly rather than leaving them blank.
3. The tested image matches the final source — done, see section 1.
4. Backup and migration rehearsals pass — the scripted rehearsal passes against a
   disposable stack; the production-data rehearsal is condition 3 in section 5.
5. Real normal purchase, group buy, presale cancellation, WeChat payment and
   refund acceptance — open.
6. Promotion of the same digest after human approval — open.

**The automated results in this record do not mean "nothing can go wrong in
production".** They mean the invariants the tests assert held on this commit on
this build, and that the specific defects listed above can no longer recur
without a test failing.
