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

## In progress

- Items 3–6.
