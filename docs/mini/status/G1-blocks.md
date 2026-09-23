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

## In progress

- Core personal layer (`orderCounts`, `userSummary`), int tests.

## Next

1. Core: personal layer; int tests (v1 productGrid still served, rich text sanitised on resolve,
   personal state never cached); invariants DECOR-015 update, DECOR-017.
2. storefront-blocks: components + scss for every block; `RichText` in the DOM shim; fixtures;
   tests on React 18 + 19; `BlockList` personal / intent; registry test.
3. Admin (`apps/web/src/admin/decor/`): `richText` + `hotspots` fields, generic render wiring,
   spike-page fixtures.
4. Mini demo page entries; `CONTRACTS_RUNTIME` += `decor/rich-text`.
5. Fidelity run → `docs/mini/status/G1-fidelity/`; `docs/mini/decor.md`.
6. Full checklist; size delta.

## Notes

- 2026-09-24: a shell `cd` chain failed and six block files were first written to the root of
  the user's master checkout (`/home/xiangyu/Projects/CRMEB/{hotspot-image,nav-grid,notice,rich-text,spacer,title-bar}.ts`,
  untracked). They were copied here; removing the stray copies was denied by the permission
  classifier, so they are still there for the user to delete.
