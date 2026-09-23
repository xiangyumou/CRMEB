# G1 — DIY blocks, batch 1: status

Branch `storefront/mini-G1-blocks` (from `storefront/mini`). Updated at every commit so the work can
resume after an interruption.

Baseline mini build before G1 (`pnpm --filter @shop/mini build`): main 381.0 KB, order 7.0 KB,
demo 81.0 KB, total 469.0 KB; react ×1; no zod.

## Done

- **Contracts** (`packages/contracts/src/decor/`):
  - `meta.ts`: field kinds `richText`, `hotspots`.
  - `rich-text.ts` (zod-free): allow-list tokenizer/parser → WeChat `rich-text` nodes,
    `sanitizeRichText` (idempotent), `sanitizeStyle`, limits. DECOR-017.
  - New blocks: `searchBar`, `navGrid`, `hotspotImage`, `notice`, `titleBar`, `productTabs`,
    `richText`, `spacer` (间隔 + 分割线 in one block, `line` switch).
  - `productGrid` → v2 (`layout`: grid2 / grid3 / list / scroll, label 商品列表) with
    `migrate[1]` (v1 → `grid2`). Shared `productDisplay` switches with `productTabs`.
  - `productTabs`: one data slot per tab (`tab0`…), all resolved with the page (no per-block
    endpoint exists for a lazy fetch; documented in the block file).
  - Personal needs: `PersonalNeed` (`orderCounts`, `userSummary`), `BlockDefinition.personal`,
    `personalSlot` kinds `orderCounts` / `userSummary`. `userCard` and `orderEntry` declare them.
  - `serviceGrid` item `action: link | contact` (additive with default; v stays 1). Built-in
    个人中心 gains a 联系客服 entry (`USER_CENTER_DEFAULT_VERSION` → `builtin-user-center-v2-2`).
  - `constants.ts`: `PRODUCT_LAYOUTS`, `productTabSlot`.
  - `examples.ts`: productGrid v2, `decorBlockExamples` (one per type).
  - Tests: `blocks.test.ts`, `rich-text.test.ts`, `decor.test.ts` updated.

- **Core** (`packages/core/src/decor/`): `orderEntryCountsFor` / `userSummaryFor` in
  `decor.resolvers.ts`; `decor-resolve.service.ts` keeps each block's `personalNeeds` (config
  only) in the cached public page and resolves them per request with a session (each kind once
  per request; failure costs the slot). Int tests in `decor.int.test.ts` ("the batch-1 blocks
  (G1)"): v1 productGrid served as v2, rich text sanitised on save and on resolve, productTabs
  slots, per-shopper counts/profile/totals never cached. `docs/invariants.md`: DECOR-003/013/015
  citations, DECOR-015 text, new DECOR-017. `pnpm guards` green.

- **storefront-blocks** (`packages/storefront-blocks/src/blocks/`): a component for every
  registered type (`BLOCK_COMPONENTS` is complete); `BlockProps.personal` / `onIntent` /
  `renderIntent`; shared `ProductCards` (4 layouts); `RichText` in the DOM shim; design-token
  scss (`shared/_tokens.scss`); fixtures for every block; `content-blocks.test.tsx` and
  `user-center.test.tsx` run on React 18 and 19 (106 tests).
- **Admin** (`apps/web/src/admin/decor/`): new `hotspot-field.tsx` (drawing on the picture,
  numeric fine-tune, link per area) and `rich-text-field.tsx` (Puck TipTap, links/code off);
  `richText` / `hotspots` semantic kinds; `config.tsx` renders any block generically and
  answers `products` needs from canvas data; `newBlockProps` fills array minimums; spike page
  shows every block. Tests: `hotspot-field.test.tsx`, `canvas-blocks.test.tsx`.
- **Core**: the admin detail returns the draft migrated (a v1 productGrid draft opens in the
  v2 editor). Int test + DECOR-003 citation.
- **Mini**: demo page renders every block through `BlockList`. Build: main 381.3 KB (+0.3 KB,
  Taro's `<rich-text>` template in `base.wxml`), order 7.0 KB, demo 118.9 KB (+37.9 KB),
  total 507.3 KB; react ×1; no zod.

## In progress

- Fidelity run (admin canvas vs Taro H5 at 375 px).

## Next

1. Fidelity run → `docs/mini/status/G1-fidelity/` (flag > 3 %); `docs/mini/decor.md`.
2. Full checklist.

## Notes

- 2026-09-24: a shell `cd` chain failed and six block files were first written to the root of
  the user's master checkout (`/home/xiangyu/Projects/CRMEB/{hotspot-image,nav-grid,notice,rich-text,spacer,title-bar}.ts`,
  untracked). They were copied here; removing the stray copies was denied by the permission
  classifier, so they are still there for the user to delete.
