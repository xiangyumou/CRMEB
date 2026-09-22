# Stream H2 — uni-app API layer, second pass

**Worktree** `../CRMEB-wt/ws-h2` · **Branch** `rewrite/ws-h2-uniapp` (from `rewrite/integration`) · **Owns** exactly what H owned: `template/uni-app/api/**`, `utils/request.js`, `config/app.js`, `libs/`, `template/uni-app/tests/**`, `template/uni-app/scripts/**`, `docs/rewrite/status/h.md`; minimal page call-site edits only where the semantics changed

Read `docs/rewrite/briefs/H-uniapp-api.md` and `docs/rewrite/status/h.md` first: the first pass left `189 calls: 85 live, 104 pending`. Since then the contracts of **E1** (`contracts/src/user`, `sms`), **E2** (`notification`, `wechat-oa`), **D** (`groupbuy`, `presale`) and **F2** (`shipping`, `cms`, `stats`) are on the integration branch — 391 routes in `openapi.json` — and the mock server serves them. Their *implementations* are still in flight; you code against contracts + mock exactly as the first pass did.

## Do
1. Clear every `CONTRACT-PENDING(E1|E2|D|F2)` marker whose route now exists: URL, mapper, tests from the contract examples, same conventions as the first pass. Where a contract has no equivalent for a legacy call (the retired 电子面单 / 配送员 items, anything CR-4-h §4/§5 rejected), delete the api function and fix its callers minimally, or leave the page dead-ended with a comment — record each in the status table.
2. Pending markers for **A / F1 / B1 / B2 / G1** (27 calls): those streams are merged, so a marker means either the contract exists under a different path (re-point) or the storefront never gets it (delete, or CR to the owning stream with the exact route you need — `docs/rewrite/cr/CR-<n>-h2.md`).
3. **Do not touch** the calls stream S is changing (CR-1-h order-number lookup, CR-2-h cart SKU change / decrement / batch favourite, CR-3-h category ETag, CR-4-h §1/§2/§6/§7, CR-5-h staff upload). S lands first; you rebase onto integration when the orchestrator tells you, then pick up whatever S left marked.
4. Keep `npm run check:routes` at 0 broken, `npm test` green with and without `MOCK_URL`, both builds passing. The remaining pending list must be *only* items waiting on S or a filed CR.

## Rules
Never push, never SSH; `next/**` is read-only for you except nothing — file CRs. Commit after every module with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Final report: pending count by stream, CRs filed, page call sites edited.
