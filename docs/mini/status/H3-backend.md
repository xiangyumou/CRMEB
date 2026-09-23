# H3 (backend follow-ups, contract owner) — status

Branch `storefront/mini-H3-backend`, worktree `/home/xiangyu/Projects/CRMEB-mini-wt/H3-backend`.
Brief: `app/config` gaps → `deriveTheme` into contracts → 小程序码 `env_version` → fake "device
mode" → docs/mini cleanup → `diyThemeTokens` typing → merge checklist.

Merged `storefront/mini` at 299956592 (G1 decor blocks) before touching the decor-typed splash link.

## Done

1. `GET /api/v1/app/config` gaps (stream A's report)
   - `serverTime` (instant). **Outside the ETag**: stamped per request after the Redis cache
     (cache key bumped to `app:config:v2`), never moves `version`; also sent as the
     `X-Server-Time` header on every answer, 304 included (a 304 has no body). SYS-017.
   - `subscribeScenes`: contract enum `appSubscribeScene` (`checkout`, `groupbuyCheckout`,
     `presaleCheckout`, `refundApply`, `returnShipment`) → ≤3 template ids each, built in
     `subscribeScenesOf` (core) from the existing `wechat-oa-runtime` lists — the mapping
     stream A kept in `templatesByScene`. `subscribeTemplates` kept (deprecated for the mini).
     SYS-018.
   - `webviewDomains`: new `wechat-mini.webviewDomains` textarea (业务域名, one per line), bare
     host names only, refused whole otherwise. SYS-019.
   - `appearance.theme.accentColor` (`#RRGGBB | null`): new `storefront-appearance.accentColor`,
     blank = `null` = use the primary colour. SYS-015 extended.
   - `splashAd.link` is a `LinkTarget | null`: new `site.splashLinkTarget` (json field); falls
     back to the legacy `splashLink` as `webview` when it is https, else `null`. `site/config`
     unchanged. SYS-020.
   - `apps/mini/src/test/app-config-fixture.ts` gained the new fields (typecheck only).

2. `deriveTheme` into contracts
   - `packages/contracts/src/system/theme.ts`: colour maths + `deriveTheme` + `themeStyle` +
     `RADIUS_FACTOR` moved unchanged from `apps/mini/src/theme/{color,derive}.ts`, plus
     `themeInputOf(appearance.theme)`. Zod-free at runtime (type imports only; a test checks).
     `system/` rather than design.md's `diy/theme.ts`: it derives `app/config`'s appearance, and
     `diy` is the legacy domain. SYS-021; design.md §3.3 updated.

## In progress

- Task 3: 小程序码 `env_version` from config.

## Client follow-ups (stream A)

- `app-config.ts`: drop `templatesByScene`; `setSubscribeTemplates(config.subscribeScenes)`;
  `SubscribeScene` = `import type { AppSubscribeScene } from '@shop/contracts/system/app.schemas'`.
- `setWebviewDomains(config.webviewDomains)` in `applyAppConfig`.
- `setServerTime(Date.parse(config.serverTime))` on a 200; on a 304 read the `x-server-time`
  header (the api-client does not surface headers today — read it in the platform transport).
- Theme: `apps/mini/src/theme/derive.ts` and `color.ts` become
  `export * from '@shop/contracts/system/theme'` (delete `derive.test.ts`, now in contracts), add
  `'@shop/contracts/system/theme'` to `CONTRACTS_RUNTIME` in `apps/mini/eslint.config.mjs`,
  and `theme/store.ts` calls `deriveTheme(themeInputOf(appearance.theme))` (picks up the accent).
  Not done here: it is three files plus the lint allow-list, not a one-line swap.
- Splash: `splashAd.link` is a `LinkTarget` (`linkTargetRoute` / `openExternalLink` for `webview`).
