# Stream F4 — System, kit & DIY follow-up: public site config, image proxy, kit edit-form loader, DIY storefront reads, logistics enum

**Worktree** `../CRMEB-wt/ws-f4` · **Branch** `rewrite/ws-f4-system-kit-followup` (from `rewrite/integration`) · **Owns** `contracts/src/{system,storage,diy}/**`, `core/src/{system,storage,diy}/**`, `apps/web/app/api/v1/{site,attachments,diy,agreements,cities}/**`, `apps/web/app/admin/(shell)/{system,storage,diy}/**`, `apps/web/app/admin-api/{system,config,storage,diy}/**`. **Touches by decision of the orchestrator**: `apps/web/src/admin/kit/**` (CR-3-d2 — F1 built the kit, you are its second owner), `apps/web/app/admin/(shell)/presale/activities/presale-activities.tsx` (only to replace the local workaround with the kit's loader), `core/src/shipping/shipping.logistics.port.ts` or wherever F2's `kuaidi100` branch lives (delete it), `docs/rewrite/status/f4.md`.

Read first: `docs/rewrite/CONVENTIONS.md`, `docs/rewrite/status/{f1,g1,g3,kit-f1crs}.md`, `docs/rewrite/cr/CR-7-h2.md`, `CR-3-h2.md`, `CR-3-d2.md`, `CR-2-f2.md`, `apps/web/src/admin/kit/README.md`. Read-only reference: `crmeb/app/api/controller/v1/PublicController.php` (`index`/`getConfig`/`getSiteConfig`), `crmeb/app/api/controller/v1/DiyController.php`, `crmeb/app/services/diy/DiyService.php` (user-center / navigation / `getColorChange`), `template/uni-app/api/{api,public,user}.js` markers `CONTRACT-PENDING(F1)` and `(G1)`.

## 1. CR-7-h2 — `GET /api/v1/site/config` (public)
One route, `auth: 'public'`, response exactly the shape the CR asks for: `name`, `logo`, `copyright` (text + link), `share` (title, synopsis, image), `payments` (which of wechat / alipay / … are enabled — read from C's payment config group, booleans only, **never a credential**), `support` (contact type + phone / mini-program flag from `wechat-mini` and the site group), `splashAd` (image + link + enabled), `version`. Every value comes from existing config groups — if a field has no home, add it to `site` with a `legacyKey`. Cache for 60 s in Redis with invalidation on config save (F1's config save path emits an event or you add one). Test: a public request needs no session; a secret-marked field can never appear in the response (write the test as a property over the config registry: every `secret: true` descriptor's value is absent from the serialized payload).

## 2. CR-7-h2 — image → base64, twice
`POST /api/v1/attachments/base64` `auth: 'user'`, body `{ url }`: only a URL that resolves to **this shop's own attachment** (same origin as `publicOrigin()` / `extraOrigins`, or the storage domain's public base) is fetched, server side, with a size cap (2 MB) and an image MIME allow-list; anything else is `ATTACHMENT_URL_NOT_ALLOWED` (422). Response `{ dataUrl }`. The two uni-app callers (`api/public.js imageBase64`, `api/user.js`) both map to it — say so in your status file. Tests: own attachment ok; a foreign host, a private-network IP after DNS resolution, an oversize body and a non-image all refused (copy F1's SSRF guard pattern from `onlineUpload`).

## 3. CR-3-d2 — the kit owns "an edit form never renders from a list row"
`ModalForm` gains `load?: { route, params, select? }`: skeleton while in flight, the form renders only with the loaded record as `initialValues`, an error state with retry, never a half-populated form. `CrudTable` given a `detailRoute` alongside its update route wires it automatically. Replace presale's local `ActivityFormModal` fetch with it and keep `presale-activities.test.tsx::编辑 > loads the detail row…` green (it should now be testing the kit's behaviour through the page). Add kit unit tests for the loader (in flight → loaded, in flight → error → retry). Grep every admin page that opens an edit modal from a `CrudTable` row and switch the ones whose update body is wider than the list row (list them in your status file with the fields that were at risk).

## 4. Read-only config descriptor (N1's leftover)
`site.publicOrigin` / `extraOrigins` are env-derived. Give the config registry a `readOnly: true` descriptor flag (with `source: 'env:PUBLIC_ORIGIN'` shown as help text) and make `ConfigGroupForm` render such fields as plain read-only text, refusing a write (`CONFIG_FIELD_READ_ONLY`, 422) at the save route. Unit test on the form, int test on the route.

## 5. CR-3-h2 — decision: per-shop decoration of the three surfaces **stays**
Three public reads under `/api/v1/diy/`:
- `GET /api/v1/diy/pages/user-center` → the 个人中心 page (menu grid, banner, 商家入口) from the DIY page the admin marks as user-center (G1 has the admin routes incl. `restore-default`/`save-default`; read `core/src/diy` for how the default rows are stored). Shape: the same envelope as `GET /api/v1/diy/pages/:id` so the renderer needs nothing new.
- `GET /api/v1/diy/navigation` → the custom tab bar (the legacy `getNavigation`).
- `GET /api/v1/diy/layouts/:type` (`category` | `user`) → `{ status }` the 版式 switch.
Public, cached 60 s, invalidated on DIY save/publish. Tests through the six production fixtures G1 kept: the user-center page round-trips, the navigation matches the fixture's tab bar, layouts default when nothing is configured.

## 6. CR-2-f2 — drop `kuaidi100`
Remove it from `logistics.config.ts`'s enum and `ui`, delete the `customer` field, delete F2's warn-and-treat-as-none branch. ETL: confirm no legacy value maps to it (CR says none does; pin with a test).

## Out of scope
The uni-app (H3 flips the markers — list every route's fields in your status file), G2's panels, storage backends.

## Rules
Never push, never SSH, never touch `crmeb/`, `template/**`, or another stream's worktree; lockfile never. `pnpm gen` after adding routes/config fields; contracts first with examples. Commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Before the final commit, from `next/`: `pnpm turbo run gen typecheck lint test:unit build`, `pnpm --filter @shop/core test:int`, `pnpm --filter @shop/web test:int`, `pnpm --filter @shop/etl test`, `pnpm exec prettier --check .`, `pnpm --filter @shop/contracts check:examples`. Write `docs/rewrite/status/f4.md`. Final report: routes with fields, kit API added, pages migrated to the loader, anything left.
