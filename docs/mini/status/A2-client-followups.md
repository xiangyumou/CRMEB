# A2 (client + test-infra follow-ups) — status

Branch `storefront/mini-A2-client-followups`, worktree
`/home/xiangyu/Projects/CRMEB-mini-wt/A2-client-followups`. Brief: H3's "Client follow-ups
(stream A)" (subscribe scenes, web-view domains, server clock, theme from contracts), the splash
link, and `apps/web` unit-test timeouts under load.

## Done

1. Subscribe scenes: `templatesByScene` is gone; `applyAppConfig` passes
   `config.subscribeScenes` to `setSubscribeTemplates`. `SubscribeScene` is the contract's
   `AppSubscribeScene` (type import). A stored copy without `subscribeScenes` (older build) is
   ignored, as before for missing fields.
2. Web-view domains: `applyAppConfig` calls `setWebviewDomains(config.webviewDomains)`, so
   `openExternalLink` opens the shop's 业务域名 in the web-view (it only allowed
   `mp.weixin.qq.com` before).
3. Server clock: `lib/server-clock.ts` keeps the offset. A 200 of `app/config` sets it from
   `serverTime` (never the stored copy's); `serverClockTransport` wraps the platform transport
   in `data/api.ts` and sets it from any `X-Server-Time` header, which covers the bodyless 304.
   A non-finite time is ignored. `serverNow()` is the helper; the kit's `Countdown` already
   reads it. The test fakes (`serveApi`, `taroFake.onRequest`) can now answer headers.
4. Theme from contracts: `theme/{color,derive}.ts` re-export `@shop/contracts/system/theme`
   (kept as files so imports do not move); `derive.test.ts` deleted (the tests live in
   contracts); `@shop/contracts/system/theme` added to `CONTRACTS_RUNTIME` in the mini's eslint
   config; `theme/store.ts` derives with `themeInputOf(appearance.theme)`, so `accentColor`
   now reaches `--color-accent` (new `theme/store.test.ts`). The weapp bundle stays zod-free
   (size report ok, no `zod` in any main-package file). Main package 490.2 KB before items 1–4
   → 490.5 KB after 1–3 → 490.6 KB after 4 (+0.1 KB for the theme switch, +0.4 KB in all).

## In progress

- Items 5–6.
