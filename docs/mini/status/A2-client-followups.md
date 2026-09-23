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

## In progress

- Items 4–6.
