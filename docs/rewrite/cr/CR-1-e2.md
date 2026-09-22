# CR-1-e2 — the shop's public origin has no owner, and two streams need it

- **Stream:** E2 (notification)
- **Status:** worked around with a local adapter; needs a home before F1's config UI is final
- **Affects:** `next/packages/core/src/system/site.config.ts` (F1), and the local
  adapter at `next/packages/core/src/notification/notification.config.ts`

## The problem

Three things need to know the origin the storefront is served from, and none of
them can work it out:

1. **A notification link.** The registry's `link` is a path — `/orders/1024` —
   because the in-app message centre and the bell are both inside the app. A
   WeChat template message is opened from WeChat's own web view, so the same
   path has to become `https://shop.example.com/orders/1024` or it is a dead
   blue word the customer taps anyway.
2. **The JS-SDK signature endpoint** (now stream E3's). It signs a URL the
   browser sends it. Signing whatever arrives is the bug — it lets any page
   borrow the shop's `jsapi_ticket` — so the endpoint must compare the request's
   host against a list of hosts that are ours.
3. Anything later that composes an absolute URL for a poster, a share card or a
   payment return.

A request's `Host` header cannot answer any of them: the effect dispatcher runs
in the worker with no request at all, and for the JS-SDK case trusting `Host`
is exactly the hole being closed.

F1 dropped `site_url` from the `site` group deliberately — the legacy installer
rewrote it on every deploy and shops ended up with `http://localhost` in
production links. That reasoning is right about the *legacy field* and does not
remove the need.

## The workaround in place

`notification.siteBaseUrl` plus `notification.jsApiExtraHosts`, configured in
通知设置, read by this domain and — through `@shop/core/notification` — by
whoever needs an absolute link. Empty is the safe default: with no origin the
OA link is dropped rather than sent as a bare path, and the JS-SDK endpoint
refuses to sign anything.

It is in the wrong group. "站点公开地址" under 通知设置 is not where an operator
looks for it, and the second stream that needs it now imports the notification
domain to ask a question that has nothing to do with notifications.

## What this asks for

Add to F1's `site` group:

```ts
    /**
     * Absolute public origin, no trailing slash. Environment-derived
     * (`PUBLIC_ORIGIN`), shown read-only in the admin: it is a deployment fact,
     * not a shop setting, which is what the legacy installer kept getting wrong.
     */
    publicOrigin: z.string().max(255).default(''),
    /** Extra hosts also served by this deployment, comma-separated. */
    extraOrigins: z.string().max(500).default(''),
```

with **no `legacyKeys`** — the legacy `site_url` value is exactly the one that
should not be carried across — and no editable UI field; the config screen shows
the value and where it came from.

E2 then deletes `siteBaseUrl` and `jsApiExtraHosts` from the `notification`
group and reads F1's. The behaviour on an empty value stays as it is.

## If it is refused

The adapter keeps working and the two fields stay in 通知设置. The cost is a
setting filed under the wrong heading, and an operator who moves the shop to a
new domain has to remember that the links live under notifications.
