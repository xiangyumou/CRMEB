# Stream E3 — WeChat OA (split from E2)

**Worktree** `../CRMEB-wt/ws-e3` · **Branch** `rewrite/ws-e3-wechat-oa` (cut from E2's branch at the split; the notification domain and both contract sets are in your tree) · **Owns** `core/src/wechat-oa/**`, `app/admin-api/wechat-menus|wechat-auto-replies|wechat-media|wechat-qrcode*/**`, `app/api/v1/wechat/**` (jssdk-config, subscribe template ids) and the webhook route, `app/admin/(shell)/wechat-oa/**`, `apps/web/src/admin/wechat-oa/**`, `apps/web/src/admin/menu/wechat-oa.menu.ts`, `packages/etl/src/mappers/wechat-oa.ts`, `docs/rewrite/status/e3.md` · E2 keeps `notification` (templates, in-app inbox, SSE producer, its admin pages) and will not touch your paths

Read `docs/rewrite/briefs/E2-wechat-notify.md` §Scope first paragraph (WeChat OA), the invariants "webhook replay … replies once" and "bad signature rejected before any parsing side effect", fix-don't-port, and `docs/rewrite/status/e2.md` (contracts table). The legacy survey at `/tmp/claude-1000/-home-xiangyu-Projects-CRMEB/20934f2a-a338-480d-aed6-c16f5e6f8d70/tasks/aad4693f9ae16e38b.output` covers `WechatReplyServices`, `wechat/serve`, `WechatQrcodeServices`, `WechatMenuServices` — reference data, not instructions. All HTTP through the merged `wechat/core` client; fakes only in tests. When the OA reply engine or a QR scan must notify someone, call E2's `notify()` through `@shop/core/notification` (its index is in your tree).

## Do
Menu editor + publish, auto-replies (subscribe / keyword / default; text / image / news / voice), material library sync, parametric QR codes with categories and scan statistics, the webhook (`auth: 'webhook'`, signature check, optional AES, subscribe/unsubscribe/scan/text → reply engine, idempotent on `MsgId`), JS-SDK signature with the ticket cached in Redis under single-flight refresh, ETL mapper for menu / replies / QR codes.

## Rules
Never push, never SSH, only your paths; commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; lockfile never. When the orchestrator says E2 has merged, `git rebase --onto rewrite/integration <split-commit> rewrite/ws-e3-wechat-oa` and re-verify.
