# Stream G1 — DIY core

**Worktree** `../CRMEB-wt/ws-g1` · **Branch** `rewrite/ws-g1-diy` · **Domain** `diy` (contracts, core, admin `diy/{shell,canvas,preview}`) · reference-map section "G — DIY" (component map table is the checklist)

## The hard constraint
The storefront renderer (`template/uni-app/subpackage/diyComponents/`, dispatcher `pageDesign.vue`) is **not** rewritten. The JSON your editor saves must be what that renderer reads today. Treat the saved format as a wire contract.

## Scope
1. `packages/contracts/src/diy/schema/<component>.schema.ts` — one zod schema per component key (33 admin keys; note `swipers`, `newVip`, `presale` are renderable-only and `bottomMenu` is admin-only) + the page envelope. Derive each from the old config panel defaults (`template/admin/src/components/mobileConfig/*.vue`, `store/module/moren.js`, `mobildConfig.js`) **and** from what the uni renderer actually reads. Unknown keys must survive a round trip (`.passthrough()`/catchall) — never drop data you do not understand.
2. Golden fixtures in `packages/contracts/src/diy/__fixtures__/`: every default page payload from `moren.js`, plus the 6 production pages (the orchestrator will drop them in as `prod-*.json`; until then use the demo pages from the `eb_diy` INSERTs in `crmeb/public/install/crmeb.sql`). Test: parse → serialise → deep-equal, and serialise is key-order stable.
3. `core/diy`: pages CRUD, publish/set-home, copy, restore-default, removed-component and removed-link stripping on read (port `DiyCompatibilityServices::clean` semantics exactly: list re-index only for lists, http links untouched), themes (colour theme selection), link registry (`LinkSource` real implementation: static page list + product/category/article/custom pickers via other domains' contracts), storefront read endpoints (`GET /api/v1/diy/pages/home`, `/pages/:id`, `/theme`), version/etag for client caching.
4. Editor shell in `apps/web/app/admin/(shell)/diy/` + `src/admin/diy/`: three-pane editor (palette / phone canvas / config panel host), zustand store with undo/redo, dnd-kit sorting, page settings, save/publish, preview QR. Preview components for every creatable key (`src/admin/diy/preview/<key>.tsx`).
5. **Freeze the panel interface in your first two days** and tell the orchestrator ("WS-G1 panel API ready"): `defineDiyPanel({key, schema, Panel: React.FC<{value, onChange, ctx}>})` in `src/admin/diy/panel-api.ts`, plus the shared field editors G2 will need (colour, slider, radio-group, image, link, product-picker, category-picker, sortable list) under `src/admin/diy/fields/`. Ship 3 reference panels (`swiperBg`, `goodList`, `titles`); stream G2 builds the rest against this API.

## Invariants to prove
Round-trip zero-diff on all fixtures; stripping matches the PHP on the same inputs (write the expected outputs from reading the PHP, include the removed keys list from `CoreStore::REMOVED_COMPONENTS` and `crmeb/config/core_store_removed_pages.json`); an editor-saved page for each reference panel validates against its schema.

## Out of scope
PC decoration, theme marketplace/download/export, `activeParty`, 微页面 beyond what `diy_pages.kind` covers, the uni renderer itself.
