# Stream A: mini-program foundation (status)

Branch `storefront/mini-A-shell`. Scope: `apps/mini/src/{app*,platform,session,ui,theme,lib}`
and `apps/mini/config`.

## Done

- R0 route catalogue merged. `src/app.pages.ts` is the page manifest (51 pages: 7 main, 44 in
  sub-packages, plus the dev-only `demo`). `app.config.ts` builds pages, subPackages and
  preloadRule from it. The home tab is `pages/index/index`, matching the catalogue.
- `platform/nav.ts`: `navigate`, `toPath`, `readRouteParams`, `goBack`, `parseLoginRedirect`,
  pending tab params. Unknown keys open home.
- Platform capabilities, each with weapp, h5-mp-emulation and h5-preview implementations:
  - subscribe: synchronous in the tap, ≤3 templates per scene;
  - chooseAddress, avatar button, chooseImages, uploadFile;
  - share helpers, clipboard, webview allow-list, update manager, launch scene;
  - toast/loading/modal;
  - global privacy handler (`onNeedPrivacyAuthorization` → one sheet).
- Session:
  - silent login;
  - a 401 renews once and replays once, reads and writes alike (`session/renewing-transport.ts`);
  - `requireLogin`, SMS alternative (`auth.oaPhoneLogin`), logout.
- Theme: `deriveTheme` (design §3.3, AA-checked), `themeStyle` → CSS vars via page-meta on
  weapp and an inline style on H5.
- Design tokens (`ui/tokens`), NutUI bridge.
- First UI pieces: PageShell, Button, Pressable, Icon (CSS-mask icons), Sheet, PrivacySheet,
  Illustration, Empty.
- Local Taro plugin `config/a11y-plugin.js` so `aria-*` reaches weapp templates.

## In progress

- App config module (ETag + storage cache), tab-bar styling from appearance, real cart badge.
- Placeholder pages for every manifest entry; S4 pages moved to PageShell.
- Rest of the UI kit, gallery page, screenshots.

## Next

- Shrink the `mini` guard's `UNBUILT_ROUTES` / `UNCATALOGUED_PAGES` once I1 is merged.
- Budgets, e2e `test:mini`, final checks.

## Needs a device check

- CSS mask icons.
- page-meta with its embedded navigation-bar.
- The aria template plugin.
- The privacy flow.
