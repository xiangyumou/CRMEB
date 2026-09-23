# Stream A: mini-program foundation (status)

Branch `storefront/mini-A-shell`. Scope: `apps/mini/src/{app*,platform,session,ui,theme,lib}`
and `apps/mini/config`.

## Done

- **Pages.** R0 route catalogue and I1 guards merged.
  - `src/app.pages.ts` is the page manifest: 51 catalogue pages (7 main, 44 in sub-packages)
    plus the dev-only `demo` sub-package.
  - `app.config.ts` builds pages, subPackages and preloadRule from it.
  - Every page is registered and renders. Pages without a stream yet show `BuildingPage`
    (建设中 + 回到首页).
  - Home is `pages/index/index`, as in the catalogue.
  - The guard's `UNBUILT_ROUTES` / `UNCATALOGUED_PAGES` are empty; the mutation anchors follow
    `app.pages.ts`.
- **Demo sub-package.** Left out of the production weapp build (`taro build --type weapp`
  without `--watch`); kept in dev and H5 builds; `TARO_APP_DEMO=1` forces it in.
- **AppID.** The shop's own AppID `wx4f4b772125e155ed` is committed in `.env.*` and
  `project.config.json`.
- **Navigation.** `platform/nav.ts` provides `navigate`, `toPath`, `readRouteParams`,
  `useRouteParams`, `goBack`, `parseLoginRedirect` and pending tab params. Unknown keys open
  home.
- **Platform capabilities**, each with weapp, h5-mp-emulation and h5-preview versions:
  - subscribe: requested in the tap, ≤3 templates per scene;
  - chooseAddress, the avatar button, chooseImages, uploadFile;
  - share helpers, clipboard, the webview allow-list, the update manager, launch scene;
  - toast/loading/modal;
  - the global privacy handler plus `PrivacyAgreeButton`. `PRIVACY_APIS` is a string array.
- **Session.**
  - Silent login.
  - A 401 renews once and replays once, reads and writes alike.
  - `requireLogin` (toasts in the timeline's single-page mode).
  - The SMS alternative, logout.
  - The query cache is cleared on sign-out.
  - `LoginCard` / `LoginGate`.
  - A working login page: phone quick-login, SMS, 暂不登录, and an agreement box that starts
    unticked.
- **App config.** `app-config/`: storage copy first, then `If-None-Match: W/"version"`. It feeds
  the theme, the tab bar, share defaults and subscribe templates.
- **Tab pages** (`useTabPage`): the native tab bar gets its colours, labels and uploaded icons
  from appearance. The cart badge is the real `GET /cart/count`, signed-in only.
- **Theme.** `deriveTheme` (AA-checked) and `themeStyle` → CSS vars via page-meta on weapp.
- **UI so far:**
  - PageShell, Button, Pressable, Icon, Sheet, PrivacySheet, Illustration, Empty, Card,
    Cell/CellGroup;
  - toast/confirm/alert;
  - Field, Textarea, Checkbox, Radio, Switch, AgreementCheck, SmsCodeField, Stepper.
- **S4 pages.** Product, checkout, cashier and pay-result are on PageShell and the kit and
  navigate by route.

## In progress

- The rest of the UI kit and its tests: Price, Tag, Badge, Skeleton, ActionBar, Tabs,
  SearchBar, Image, ProductCard, CouponCard, OrderCard, AddressCard, Countdown,
  InfiniteList, Result, RegionPicker, ImageUploader, AvatarPicker.
- The gallery page and its screenshots.

## Next

- Budgets, e2e `test:mini`, final checks.

## Needs a device check

- CSS mask icons.
- page-meta with its embedded navigation-bar.
- The aria template plugin.
- The privacy flow.
- `setTabBarItem` with downloaded icons.
