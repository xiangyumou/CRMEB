# AUDIT — security review, first pass

Stream K, `K-hardening.md` §5. The four surfaces where a mistake costs money or
data — **auth, payment, refund, upload** — read as an attacker, with PLAN §5
"修而不搬" as the checklist.

Every row ends in one of three places: a **test that exists** (named exactly, so
it can be run), a **CR** (a defect, with the fix proposed), or a **decision**
with the reasoning written down. Nothing ends in "looks fine".

Scope: the merged tree at `bdcf104a9` (before the E1 merge). Rows whose subject
belongs to a stream still in flight are marked `pending:<ws>` and must be
re-read in the second pass — see the bottom of `docs/rewrite/status/k.md`.

**Read the `pending:` markers against the date.** The branch was rebased onto
`rewrite/integration` at `612d0a000`, by which point D, E1, E2, F1, F2, G1-G3,
H, J and S had all merged. The guard counts below were re-run on that tree and
are current; the `pending:` rows were **not** re-read, because reading a surface
as an attacker is the work, not the label. Every one of them is on K2's list at
the bottom of `status/k.md`, and the merge that unblocks it has already
happened — so K2 starts with the audit, not with waiting.

Ids are `K-SEC-<area><n>`: **A** auth, **P** payment, **R** refund, **U**
upload, **X** cross-cutting.

## PLAN §5 — the ten "fix, don't port" items

| # | Legacy defect | State | Where | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `takeOrder`/`delivery` read-then-write with no lock | fixed | `order.fulfil.*` (B2) | `order.fulfil.concurrency.int.test.ts::shipping while a refund is approved for the same line > never lets shipped + refunded exceed what was ordered`, plus the CHECK `order_items_shipped_within_quantity` |
| 2 | `applyRefund` duplicate check outside the transaction | fixed | `refund.service.ts:171` `lockOrder` (`FOR UPDATE`) + partial unique `refund_items_open_uq` | `refund.concurrency.int.test.ts::REFUND-001 — two refund requests on one order line > lets exactly one request hold the line` (6 racers, 1 winner) |
| 3 | `incStockDecSales` read-then-write | fixed | single conditional `UPDATE` (B1) | `order.concurrency.int.test.ts::two checkouts for the last unit > …` |
| 4 | storefront token not bound to the password | fixed **on the storefront**, **broken on the admin side** | `user-session.service.ts:88` compares `passwordVersion`; the admin store compares nothing | **CR-8-k** — see K-SEC-A1 |
| 5 | `scan_upload` global token | fixed | `scan-token.ts` — per-admin, single-use Lua CAS, 600 s TTL | `storage.concurrency.int.test.ts::scan tokens are single-use > lets exactly one of six phones upload through one QR code` |
| 6 | `videoDataSave` trusts the client's path | fixed — the endpoint does not exist, and no API accepts a key | `kernel/storage.ts:111-117` generates `<dir>/<YYYY>/<MM>/<uuid>.<ext>` | `s3.test.ts::createS3Storage > generates the key itself — a caller cannot choose a path` |
| 7 | `onlineUpload` SSRF | fixed as a design, **broken as a transport** | `safe-fetch.ts` judges literals and every resolved address, re-judges every redirect hop, pins the connection to the judged IP | `safe-fetch.test.ts` (12 its, incl. `refuses a public name that RESOLVES to a private address`, `refuses a redirect into the private network`). Transport defect: **CR-11-k** |
| 8 | SMS code replay | `pending:E1` | storefront auth is E1's | re-read in K2 |
| 9 | code stored in the DB and `eval`'d | fixed and guarded | feature removed; `pnpm guards`' `banned` check refuses `eval`, `new Function`, `child_process` outside scripts, and asserts `no-eval`/`no-new-func` are still lint errors | `guards/src/checks/banned.ts`, run by `pnpm guards` |
| 10 | `handleTransferNotify` unverified | fixed — **there is no transfer endpoint**, and both webhooks share one verifier | `grep handleTransferNotify` → nothing; `wechat.crypto.ts:101-116` | `payment.int.test.ts::PAY-003 … > answers 401 for a signature it cannot verify, before touching the database` |

## Auth

| id | Item | Verdict | Evidence / CR |
| --- | --- | --- | --- |
| K-SEC-A1 | A password change revokes every admin session | **defect** | The per-admin Redis index expires at `ttlMs * 4` and is never slid, while the session key is slid on every request, so a session older than 32 h is invisible to `revokeAllForAdmin`. The `passwordVersion` "second belt" the store's comment promises does not exist on the admin side. **CR-8-k** |
| K-SEC-A2 | Login throttle | pass | Per **account**, not per IP — every request arrives through one proxy, so an IP bucket is either useless or a self-inflicted outage. Five wrong passwords park the account 15 min; a good password clears it. `auth.int.test.ts::the per-account login throttle > parks the account after the fifth wrong password`, `> is keyed by account, so one account cannot lock another out`, `> counts concurrent attempts atomically — five wrong passwords is five` |
| K-SEC-A3 | Account enumeration | pass | A wrong account and a wrong password return the same error; a disabled account is only revealed *after* the password verifies. `auth.int.test.ts::admin login > gives the same error for a wrong password and an unknown account`, `> refuses a disabled account, but only once the password is right` |
| K-SEC-A4 | The login itself is not audited | decision, with a gap | `POST /admin-api/auth/login` is `auth: 'public'`, so there is no admin actor when `handle()` would write the row, and the body holds the password. Deliberate: `handle.int.test.ts::does NOT audit the login itself — the body holds the password`. **The gap:** a *failed* login and a lockout also leave no audit row, only a log line, so "who tried to get in" is not answerable from `audit_logs`. Recommend a dedicated write on the login outcome (account, result, IP — never the body). Re-check in K2 |
| K-SEC-A5 | Session tokens at rest | pass | 40-byte random token, stored as `sha256Hex(token)`; a Redis dump is not replayable. `auth.int.test.ts::admin sessions > stores only the hash of the token`, storefront: `> stores sha256(token) and never the token` |
| K-SEC-A6 | Reading the payment configuration requires the write atom | decision | `writePermissionFor` only derives `:write` from a `:read` atom, so `payment` and `wechat` (both `payment:config:write`) collapse read and write. Deliberate — the group holds a merchant private key — and documented at `system.test.ts:114`. Consequence worth knowing: **there is no read-only role for payment settings** |
| K-SEC-A7 | Password storage | pass | bcrypt (cost 10, 4 in tests); legacy md5 rows verify once in constant time and are rewritten as bcrypt on that login; a password over 72 bytes is refused rather than silently truncated. `auth.int.test.ts::admin login > upgrades a legacy md5 hash to bcrypt on the first good login`; `password.ts:66-85` |
| K-SEC-A8 | CSRF on cookie-authenticated mutations | pass | `SameSite=Lax` plus a second lock that does not depend on the browser: `Sec-Fetch-Site` same-origin/same-site, or `Origin` on the allow-list; neither header present is a refusal. `handle.ts:152-178`, `handle.int.test.ts` (`AUTH_CROSS_SITE_BLOCKED`) |
| K-SEC-A9 | Every admin write is audited with a target | pass, 26 exemptions | `pnpm guards`' `route-hygiene` check: 133 admin write URLs, each must call `ctx.audit(target)`. Exemptions are named individually and compared exactly, with a CR against each one that is a defect rather than a decision — login (K-SEC-A4), `POST /catalog/sku-matrix` (a POST-shaped read), the two notification-inbox routes (a decision), `POST /attachments/scan-tokens` (**CR-5-k**), and the 21 notification / WeChat-OA writes that merged without one (**CR-17-k**, split between N1 and E3) |
| K-SEC-A10 | Permission atoms are real | pass | `pnpm guards`' `permissions` check: 106 declared atoms, 106 used by 258 admin routes and 44 menu entries, no route or menu entry naming an atom nobody declares, no atom nobody uses |
| K-SEC-A11 | Storefront sessions | `pending:E1` | The service is here and tested (`auth.int.test.ts::storefront sessions > REJECTS a session whose passwordVersion is stale, and revokes it on sight`), but the routes that use it are E1's. Re-read in K2 |

## Payment

| id | Item | Verdict | Evidence / CR |
| --- | --- | --- | --- |
| K-SEC-P1 | Every inbound callback is verified, before anything is written | pass | Two webhook routes exist in the whole app, both call the one verifier first, inside a try/catch that answers 401 before `ctx.withTx`. `payment.service.ts:645-651`, `refund.service.ts:870-876`. `payment.int.test.ts::PAY-003 … > answers 401 for a signature it cannot verify, before touching the database` (asserts the callbacks table is empty), `refund.concurrency.int.test.ts::REFUND-003 … > refuses a notification whose signature does not verify, before touching the database` |
| K-SEC-P2 | The verifier fails closed | pass | Header presence → 300 s timestamp skew → **known serial** → RSA-SHA256, and an unknown serial is a refusal rather than a default. `wechat.crypto.ts:101-116`. `wechat.crypto.test.ts::TLS-003 — an unfetchable platform certificate is a refusal, not a default > refuses when the key set is empty` |
| K-SEC-P3 | The signature covers the bytes that were sent | pass | The route reads `await ctx.request.text()` and verifies those bytes; nothing re-serialises an object first. `apps/web/app/api/v1/webhooks/wechat-pay/route.ts:21` |
| K-SEC-P4 | Replay | pass | A unique index, not a memory check: `payment_callbacks_notify_uq (mch_id, provider_notify_id)` with `INSERT … ON CONFLICT DO NOTHING … RETURNING`; a null return ends the handler. Second layer for two ids carrying one transaction: a conditional `UPDATE` plus the `replay` branch. `payment.concurrency.int.test.ts::PAY-007 — duplicate callback delivery > books the money once however many times WeChat delivers the same notification`, `> is the callback insert that decides, not a prior read — the repo statement alone` (8 racers, 1 winner), `> marks the order paid exactly once — the conditional update alone` |
| K-SEC-P5 | A paid amount that disagrees is never booked | pass | Compared against the attempt's frozen amount with strict inequality, so short **and** over are refused into a payment exception; unparseable, absent and zero are acknowledged and parked (a 500 would ask WeChat to redeliver the same bytes forever). `payment.service.ts:436`, `:751-753`. `payment.int.test.ts::GATEWAY-001 — an amount that disagrees is never booked > refuses a <short/over> amount, however well signed it is`, `> parks an <unparseable/absent/zero> amount on the callbacks table instead of looping` |
| K-SEC-P6 | The endpoint does not act on an event meant for the other one | weak, fail-closed by accident | `verifyNotification` does not compare `event_type` with the endpoint. A signed `REFUND.SUCCESS` posted to the payment webhook is accepted by the verifier and then discarded downstream only because `trade_state !== 'SUCCESS'` (`payment.service.ts:676`). Recommend an explicit check at the verifier; no test. Re-check in K2 |
| K-SEC-P7 | A callback for another merchant | weak | `mch_id` mismatch is logged and settlement proceeds (`payment.service.ts:707-711`). Not exploitable — the signature is verified against our own platform key — but it should be a refusal, not a log line. No test. Re-check in K2 |
| K-SEC-P8 | At most one open payment attempt per order | pass | Partial unique `payment_attempts_open_uq` on `order_id WHERE status in ('creating','submitted','closing','unknown')`. `payment.concurrency.int.test.ts::PAYC-004 … > inserts at most one open attempt — the unique index alone` |
| K-SEC-P9 | One shopper cannot see another's payment | pass | `payment.service.ts:135`, `:358` compare `userId`. `payment.int.test.ts::CLIENT-001 — what the cashier is told > never shows one shopper another shopper's payment` |
| K-SEC-P10 | TLS verification cannot be turned off from the admin | pass | No group this stream owns can grow a verification switch; the trust store is the container's. `payment.config.test.ts::TLS-001 — no TLS toggle, in any group this stream owns > …` (the cell's ids are mangled in `invariants.md` — **CR-2-k** §4) |

## Refund

| id | Item | Verdict | Evidence / CR |
| --- | --- | --- | --- |
| K-SEC-R1 | One line, one open after-sale | pass | Partial unique `refund_items_open_uq ON refund_items (order_item_id) WHERE is_open`, taken under the order's `FOR UPDATE`, with the violation renamed to `REFUND_ALREADY_OPEN`. `refund.concurrency.int.test.ts::REFUND-001 … > lets exactly one request hold the line` |
| K-SEC-R2 | A refund can never exceed what was paid | pass, four layers | apply-time ceiling counting other open requests (`REFUND_EXCEEDS_PAID`); a settle-time conditional `UPDATE` carrying the invariant in its `WHERE`; the CHECK `orders_refunded_within_paid`; the per-refund CHECKs. `refund.concurrency.int.test.ts::REFUND-001 … > never lets two requests together ask for more than was paid`, `refund.int.test.ts::REFUND-005 … > never gives back more than the order was paid, across several requests`, `refund.rules.test.ts::remainingCeiling …` |
| K-SEC-R3 | Two operators pressing 同意 send money once | pass, three gates | a conditional `applied → approved` under `lockRefund`; one effect-ledger row keyed `(refund, id, refund.execute)`; `executeRefund` claiming `→ processing` before leaving the transaction, with `out_refund_no` frozen so WeChat deduplicates a re-send. `refund.concurrency.int.test.ts::REFUND-002 … > queues one gateway call however many times the operator presses 同意`, `> moves 'applied' exactly once — the conditional update alone`, `REFUND-006 … > sends one refund however many effect dispatchers run` |
| K-SEC-R4 | A retry cannot change the amount | pass | The frozen `requestContext` is re-checked before every send; a row edited afterwards throws `REFUND_AMOUNT_MISMATCH`. `refund.int.test.ts::REFUND-005 … > refuses a retry that asks for a different amount than the one frozen` |
| K-SEC-R5 | A stranger cannot read or act on another shopper's after-sale | implemented, **not asserted** | Six entry points compare `userId` and answer `REFUND_NOT_FOUND` — the same code as "does not exist", so the surface cannot be used to probe ids (`refund.service.ts:103,172,342,370,402,434`). Nothing tests it; AUTH-005 is `unmapped`. **CR-3-k** |
| K-SEC-R6 | The refund notification's own amount is not read | weak | `handleRefundNotify` settles with the local `row.amount` and never looks at `resource.amount.refund`. Defensible — the frozen amount is authoritative — but a disagreement should be an exception row rather than silence. No test. Re-check in K2 |
| K-SEC-R7 | The admin refund atoms | **untested** | Seven routes, four atoms, correctly declared (`refund.admin.ts:53,81,104,199,242,275,293`). Every test builds its actor as `isSuper: true`, which short-circuits `hasPermission`, so **no test exercises any atom negatively**. Covered at the HTTP boundary by K's `e2e/admin/specs/restricted-role.spec.ts`; the domain-level assertions are asked for in **CR-14-k** |
| K-SEC-R8 | `/api/v1/staff/refunds*` | **defect** | The staff routes forward into the admin services, which demand an admin atom, and `hasPermission` refuses every non-admin actor — so they answer 403 for every staff user, always. Fails closed, but the console does not work and the obvious "fix" would hand every assistant the admin surface. **CR-14-k** |
| K-SEC-R9 | The 售后设置 group's write atom | **defect** | The group declares `refund:request:write`, which is the atom for 备注售后单, and the read/write derivation does not fire for a `:write` atom — so the remark permission also rewrites the address buyers ship returns to. **CR-10-k** |
| K-SEC-R10 | `detail()` has no ownership check | latent | Exported without a `userId` comparison; every current caller checks first (`refund.service.ts:970`, callers at `:292,358,394,434`). Not a live leak. Worth a `// storefront callers must check ownership first` or an explicit parameter. Re-check in K2 |

## Upload

| id | Item | Verdict | Evidence / CR |
| --- | --- | --- | --- |
| K-SEC-U1 | The accepted type is decided by the bytes | pass | `sniffFileType` reads magic numbers; the declared mime only distinguishes the two OOXML formats inside a ZIP container, and a bare ZIP is refused. SVG, XML, HTML, PHP, shebangs, ELF, PE and Mach-O are refused before the allow-list is consulted. A declared type that disagrees with the bytes is an error, not a silent correction. `file-type.test.ts::sniffFileType — the files that must never get in > refuses SVG — always, script or not`, `> refuses HTML, which would run as our own origin`, `> refuses a PHP script however it is named or declared`, `> refuses executables`; `storage.int.test.ts::/admin-api/attachments > refuses what the old uploader accepted > refuses <each of five>`; `/api/v1/uploads > refuses an executable from a shopper too` |
| K-SEC-U2 | SSRF on "import from URL" | pass as a design | Scheme and port allow-list, credentials refused, literal IPs judged before DNS, **every** resolved address judged (v4 and v6, including unwrapping `::ffff:`), loopback-by-design hostnames refused, every redirect hop re-judged with `redirect: 'manual'`, a `Content-Length` pre-check **and** a streamed hard stop, and one whole-operation timeout. Refusals collapse to two opaque codes so the endpoint cannot map the network. `safe-fetch.test.ts::safeFetch — refusals > refuses a public name that RESOLVES to a private address`, `> refuses a name that resolves to one public AND one private address`, `> refuses a redirect into the private network`, `> stops reading at maxBytes even when Content-Length lied`; route: `storage.int.test.ts::refuses to import from a private address, after resolving the name` |
| K-SEC-U3 | …but the transport is wrong | **defect** | The connection is made to the judged IP by rewriting `url.hostname`, so TLS SNI and certificate validation use the IP: every `https://` import fails the handshake. Every test injects `fetchImpl`, so no test opens a socket. Also: plain `http://` is accepted although PLAN §5 asks for an https allow-list. **CR-11-k** |
| K-SEC-U4 | The storage key is never the client's | pass | `<dir>/<YYYY>/<MM>/<uuid>.<ext>`, directory hint sanitised to `[a-z0-9-]{1,32}`, extension from the sniffer; no contract has a `key` or `path` field; the local driver additionally refuses `\0`, leading `/` and `..` and re-checks containment. `s3.test.ts::createS3Storage > generates the key itself — a caller cannot choose a path` |
| K-SEC-U5 | Component-test fixtures are not checked against the contract | **defect (class)** | A stubbed `fetch` returns a hand-written object that TypeScript never compares to the contract, so a fixture can be missing a field until a component reads it — which is why `customers.test.tsx` crashed only under load and was fixed by hand in `8a03f8cb`. **CR-7-k** |
| K-SEC-U6 | The scan token | pass | Per-admin, single-use through an atomic Lua CAS, 600 s TTL, another admin's token reads as *expired* rather than as someone else's, and a rejected file releases the claim instead of burning the code. `storage.concurrency.int.test.ts::scan tokens are single-use > lets exactly one of six phones upload through one QR code`; `storage.int.test.ts::scan-to-upload > reads another admin's token as expired rather than as somebody else's`, `> does not burn the token when the file is refused` |
| K-SEC-U7 | …with two rough edges | **defect** | The public `POST /api/v1/attachments/scan-uploads/:token` has no rate limit although `userUpload` has one, so an unauthenticated client can make the server parse and sniff bodies as fast as it can send them; and `COMPLETE_LUA` checks `EXISTS` where the other two scripts compare-and-set on `state`. **CR-12-k** |
| K-SEC-U8 | The token at rest | decision | The token is the Redis key (`storage:scan:<token>`), not hashed. Matching is a key lookup, so there is no timing oracle, and the entropy is 120 bits over a 600 s window — but a Redis dump or `KEYS storage:scan:*` yields live tokens. Acceptable for a 10-minute upload code; recorded so the decision is visible. Re-check in K2 |
| K-SEC-U9 | Uploads are served from the app's own origin | weak | `localPublicPrefix` defaults to `/uploads` on the app origin, and `X-Content-Type-Options: nosniff` is set nowhere in the repository. The byte-level defence (U1) is what holds today, and it is exactly one layer. **CR-13-k** (`pending:J` — `deploy/next/` is not written yet) |
| K-SEC-U10 | A user cannot choose the served content type | pass | The stored `Content-Type` is the **sniffed** mime, not the declared one (`storage.service.ts:513-517` → `s3.ts:224-229`); no route serves object bytes and `Content-Disposition` appears nowhere |
| K-SEC-U11 | Secrets never leave through a response | pass | A secret config field travels as an "is set" boolean; an empty value on save is skipped so a partial form cannot blank a credential. Asserted from both ends: `system.int.test.ts::never returns a stored secret — only whether one is set` (the value is in the DB row and not in the JSON), `system.test.ts::marks every credential in every registered group as secret`, and `pnpm guards`' `secrets` check, which walks 8465 response-schema nodes across 397 contracts |
| K-SEC-U12 | …but they do leave through the audit log | **defect** | `redactPayload` strips only the top level, and `configSaveBody` nests everything under `values`, so `PUT /admin-api/system/config/payment` writes the merchant private key and `apiV3Key` into `audit_logs` in the clear. **CR-9-k** |

## Cross-cutting

| id | Item | Verdict | Evidence / CR |
| --- | --- | --- | --- |
| K-SEC-X1 | Internal errors never reach the client | pass | `handle()` catches everything non-`DomainError` and answers `INTERNAL` with no message, stack or SQL; response-validation failures include details only outside production. `handle.ts:418-428` |
| K-SEC-X2 | The response always matches its contract | pass | `VALIDATE_RESPONSES=1` in CI makes a mismatch a 500 rather than a leak. `.github/workflows/next.yml` |
| K-SEC-X3 | A retired feature cannot come back | pass | `pnpm guards`' `retired` check: 26 features as identifiers and URL tokens over 1122 source files and 397 route paths, with per-word deny-lists for the files that name them in order to refuse them. `guards/src/checks/retired.test.ts::the retired blacklist > finds no retired identifier in next/ or the uni-app API layer` |
| K-SEC-X4 | Only the contract's URLs are reachable | pass | `pnpm guards`' `contracts` check, both directions, plus `admin-client`: no hand-built `/admin-api/…` string and no raw `fetch()` outside the api seam (one documented exception, the SSE stream). `guards/src/checks/contracts.test.ts::contracts and route files > …` |
| K-SEC-X5 | The ambient clock cannot come back into core | pass | `guards/src/checks/banned.ts` imports `@shop/config/eslint` and asserts `no-restricted-properties` on `Date.now`, the zero-arg `new Date()` selector, `no-eval` and `no-new-func` are all still `error` — lint is configuration and can be turned off in one line |
| K-SEC-X6 | Domains are really installed in the process that runs them | **defect** | `domains.gen.ts` installs eight domains with an unused namespace import, which esbuild elides: `apps/worker`'s bundle carries six of twelve. Every test passes because vitest's transformer keeps it. **CR-1-k** |
| K-SEC-X7 | The in-memory fakes accept only what the real adapter accepts | **defect** | `memoryQueue()` takes any `dedupeKey`; real BullMQ refuses one containing `:`, which is the shape of all three keys in the repository — so 发货, 确认收货 and **checkout** each commit their transaction and then answer 500 on a real Redis. No unit or integration test can see it: they all build their `Ctx` with the fake. Found by `specs/order.spec.ts` on the first real shipment. **CR-15-k** |
| K-SEC-X8 | The admin UI refuses what the API refuses | gap, second-order | No page uses `RequirePermission`, so a restricted admin who opens a forbidden URL directly gets the shell and a row of failed fetches rather than the 403 screen. The server boundary holds — `specs/restricted-role.spec.ts` proves six cross-domain reads and the escalation write are 403 — so this is about the screen being honest, not about exposure. **CR-16-k** (filed with the 个人资料 menu item, which pushes a URL that does not exist) |

## What this pass did not cover

Each line names the stream it waited on and whether that stream has since
merged. "Merged" means K2 can start on it immediately — it does not mean it has
been read.

- Storefront auth, registration and the SMS code path — `pending:E1`, **merged**
  (`8a03f8cb6`). Carries PLAN §5 item 8 (SMS code replay) and K-SEC-A11.
- Notifications and the WeChat OA surface — `pending:E2`, **merged**; the OA
  half went on to E3, still in flight. **CR-17-k** came out of the boundary
  between them.
- Group-buy and presale — `pending:D`, **merged**; presale is D2, in flight.
- Shipping, CMS and statistics — `pending:F2`, **merged**; statistics is F3,
  in flight.
- The deployment edge, TLS termination, rate limiting at the proxy and the
  container's own posture — `pending:J`, **merged**; the compose files,
  rehearsal drill and images are J2's and in flight. **CR-13-k** is addressed
  there.
- Load and denial-of-service behaviour (`K-hardening.md` §4) — second pass. It
  needs `deploy/next/compose.yml`, which J2 has now written, so the blocker is
  gone.
- The 19 route files of the WeChat OA admin surface and the notification
  routes, beyond the audit-target sweep that produced **CR-17-k**: they merged
  after this pass was written and have had no attacker read at all.
