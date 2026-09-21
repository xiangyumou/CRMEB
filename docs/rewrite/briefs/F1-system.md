# Stream F1 — System and storage

**Worktree** `../CRMEB-wt/ws-f1` · **Branch** `rewrite/ws-f1-system` · **Domains** `system`, `storage` · reference-map section "F1 — System"

## Scope
Admins (CRUD, status, own profile + password change revoking sessions), roles with a permission tree built from the code-declared atoms, audit log viewer, agreements (user/privacy/cancellation texts; public read on the storefront), settings screens: one generic page per config group driven by `ConfigGroupForm` + the registry descriptor endpoint (`GET /admin-api/system/config-groups`, `GET/PUT /admin-api/system/config/:group`). Define the config groups that have no other owner: `site` (name, logo, ICP, contact QR, share defaults), `storage`, `order` (auto-cancel minutes, auto-receive days, auto-review days, stock warning, free-shipping threshold, staff user ids for the mobile console), `wechat-oa`, `wechat-mini`, `sms`, `logistics`, `map`. Each with `legacyKeys` mapping old `eb_system_config.menu_name` keys (config tab tree is in the reference map) — this is the config ETL.
Storage: attachments + categories, upload (multipart, size/MIME sniffing by magic bytes, image dimension probe via `sharp`, server-generated keys, sha256 dedupe), the real `AssetSource` for the kit's `AssetPicker`, local driver + S3-compatible driver, storefront upload endpoint (avatar, review and refund images) with per-user rate limit, phone-scan upload with a single-use token bound to the admin, remote-URL import through `core/src/storage/safe-fetch.ts`, orphan cleanup job (`clearPoster` successor). Admin dashboard header endpoint shell (numbers come from F2 later; ship the layout with your own counts: admins, attachments, pending items via a small `DashboardContributor` registry).

## Invariants to prove
Permission boundaries (a role without an atom gets 403 on the route and no menu entry; super admin passes), secrets never returned by config reads, session revocation on password change, upload rejects executable/HTML/SVG-with-script and mismatched MIME, safe-fetch blocks private, loopback, link-local and metadata addresses **after DNS resolution** and on redirects, scan token single-use.

## Fix, don't port
`scan_upload` global token; `videoDataSave` client paths; `onlineUpload` SSRF; saving config with side effects (SSL file paths) — none of that.

## Out of scope
Code generator, file manager, DB backup/clear, system routes registry, custom events/timers, upgrade, licence checks, multi-language, outapi accounts, receipt printers, 一号通, data dictionaries, 组合数据 (system_group) as a generic feature — its few live uses (home banners, user-centre menus) are DIY/F2 concerns.
