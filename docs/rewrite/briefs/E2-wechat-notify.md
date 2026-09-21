# Stream E2 — WeChat official account and notifications

**Worktree** `../CRMEB-wt/ws-e2` · **Branch** `rewrite/ws-e2-notify` · **Domains** `wechat/oa`, `notification` · reference-map section "E2 — WeChat OA & notifications" · starts after stream C's `wechat/core` client is merged

## Scope
WeChat OA admin: custom menu editor (tree, publish to WeChat), auto-replies (subscribe, keyword, default; text/image/news/voice), material library sync (`wechat_media`), parametric QR codes with categories and scan statistics, the OA message webhook (`auth: 'webhook'`: signature check, optional AES mode, subscribe/unsubscribe/scan/text events → reply engine, idempotent on `MsgId`). JS-SDK signature endpoint for H5 (`/api/v1/wechat/jssdk-config`), cached ticket in Redis with single-flight refresh. All HTTP through C's `wechat/core`.

Notifications: one registry of business events → channels. Other domains call `notify(tx, ctx, {event, audience, userId|adminId, data})`, which records an effect; the handler fans out per the template's enabled channels: in-app message (`notification_messages`), OA template message, mini-program subscribe message, SMS (through E1's `sms` index). Admin: template list (one row per event, per-channel switch + template id + content), send log. Storefront: my messages list/read/read-all, unread count, mini-program subscribe-template id list per scene. Admin in-app inbox + the **SSE producer**: publish to the Redis channel the shell's bell already listens on (`/admin-api/notifications/stream`, see `apps/web/src/admin/notifications`), plus list/read endpoints so read state is no longer in-memory. New-order / refund-request / low-stock events reach admins this way; reading never mutates (the old `jnotice` marked items seen on fetch).

ETL mapper: notification templates (map the 17 legacy events onto the new registry; drop channels for retired features), OA menu, replies, QR codes.

## Invariants to prove
Rows under "Registration and notifications". Tests (mandatory): a failing channel never fails the business transaction and is retried by the ledger; the same event for the same aggregate notifies once under two dispatchers; webhook replay with the same `MsgId` replies once; webhook with a bad signature is rejected before any parsing side effect; SSE delivers to two connected admins and respects permissions for the event type.

## Fix, don't port
- The dead admin WeChat users/tags pages (their routes never existed) are not rebuilt.
- Enterprise-WeChat robot, printers, workerman/`wss` config side effects — gone; SSE needs no custom server.
- 一号通 SMS settings pages — gone; SMS config is E1's typed group.

## Out of scope
WeChat Pay and the low-level client (C), login flows (E1), customer-service chat, mini-program live, OA user/tag management.
