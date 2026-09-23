# I2 (end-to-end coverage, invariants, docs) — status

Branch `storefront/mini-I2-e2e-docs`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/I2-e2e-docs`.
Brief: e2e coverage matrix (legacy specs + SMOKE rows → `specs-mini/`), the missing mini specs,
mini citations in `docs/invariants.md`, the mini sections of `architecture.md` / `conventions.md`,
`docs/mini/README.md`, `docs/mini/cutover.md`, CI sanity.

## Done

- Baseline: `test:mini` 15/15 green on `storefront/mini` at `91e3893fc`.
- `specs-mini/decor.spec.ts` + `src/mini-pages/decor-pages.ts`: a page published through the
  admin API with ten block types renders each in order on the 微页面 and follows the next
  publish; the preview token (DECOR-012); the web-view 业务域名 allow-list (allowed → web-view
  page, other → copied).
- `specs-mini/login.spec.ts`: silent sign-in, SMS sign-up (wrong code counted, code stays usable),
  401 renewal with read replay, 401 renewal with a write replayed once.

## In progress

- Share-scene and review-moderation specs; the coverage matrix; invariants; docs; CI comments.

## Pending

- Account-page specs wait for E to merge into `storefront/mini`.
