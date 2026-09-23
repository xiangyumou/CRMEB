# F2 — DIY v2 admin editor (店铺装修): status

Branch `storefront/mini-F2-decor-editor`. Updated at every commit so the work can resume after an
interruption.

## Done

- Contracts (reported to the user): `visibility.platforms` is no longer `hidden` — the editor draws
  an array of an enum as a multi-select (`meta.ts` convention 3 says so; radio threshold ≤ 4).
- Editor adapter `apps/web/src/admin/decor/`:
  - `zod-to-puck.ts`: switch / choice (Segmented or Select) / multiChoice / group headings
    (`__group:` pseudo fields) / every semantic kind; `initialPropsOf` (min list items).
  - `document.ts`: v2 document ⇄ Puck data; older blocks migrated in, unknown / newer / failed
    blocks carried through untouched as `__unknown`; `canonicalJson` for the dirty check.
  - `config.tsx`: built from the contracts registry (every block), palette filtered by
    `meta.pages` for the page kind, storefront component or a “画布暂无预览” placeholder,
    phone navbar with the page title.
  - `canvas-data.tsx`: `DecorCanvasData.resolve(need)`, `useCanvasSlots`; admin implementation
    previews products (as the resolver picks them); other needs show the block's empty state.
  - `records.tsx`: `DecorRecordSource` (products, labels, articles, coupons, group-buys via the
    legacy DIY source; presales and 微页面 new).
  - `fields/`: image (AssetPicker), colour (presets), choice, switch, multi-select, group heading,
    link (every kind; `route` covers every linkable catalogue key with param controls —
    `link-routes.ts`, held in step with the catalogue by `link-routes.test.ts`), the five data
    sources (manual ordered list / rule), unsupported fallback.
  - `editor.tsx`: `DecorEditor` (Chinese Puck dictionary, custom toolbar + undo/redo, read-only
    mode) and `DecorPagePreview` (read-only phone frame).
- ESLint: `@puckeditor/*` may only be imported inside `src/admin/decor`.
- `/admin/dev/decor-spike` kept as the **decor component sandbox** (dev-only; the fidelity script
  shoots its canvas), moved to the new interfaces.
- Unit tests: `zod-to-puck`, `document`, `canvas`, `fields/link-routes` (72 green).

## In progress

- Admin pages under `app/admin/(shell)/decor/**` + `decor.menu.ts`.

## Next

- Editor page (save draft / conflict / publish / dirty guard / warnings), revisions drawer,
  preview panel (`DECOR_PREVIEW_URL`), page tests.
- e2e `e2e/admin/specs/decor.spec.ts`.
- Templates last (after `git merge storefront/mini` if G1 has merged).
- Checks, screenshots (`docs/mini/status/F2-screens/`), report.
