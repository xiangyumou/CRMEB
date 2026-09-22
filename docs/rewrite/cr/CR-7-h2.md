# CR-7-h2 — the app has no way to read the shop's own public settings

- **Stream:** H (uni-app storefront), raised against F1 (system / storage)
- **Status:** open
- **Affects:** `next/packages/contracts/src/system/` — there is no storefront
  contract there, only `system.admin.contract.ts`

F1 built the settings system end to end for the console:
`GET /admin-api/system/config-groups` and `GET|PUT /admin-api/system/config/:group`
read and write every group an operator edits. Nothing reads them back out for
the app.

Seven of the eight calls below are one sentence each — "what did the operator
type into that box" — and they are spread across the first screen a cold
visitor sees, the login screen, the payment screen and every page with a 客服
button. This is the largest purely-cosmetic gap H2 leaves, and it is cheap to
close: one route, one response.

## What the app reads, and where

| Call | Read on | What it needs |
| ---- | ------- | ------------- |
| `basicConfig` | `App.vue`, `pages/goods/cashier` | site name, whether 微信/支付宝/余额 pay buttons show |
| `getLogo` | `pages/users/login`, `wechat_login`, `Authorize` | the logo above the sign-in form |
| `getShare` | `pages/index`, `pages/annex/special` | default share title / image / summary for `wx.updateAppMessageShareData` |
| `getCrmebCopyRight` | `App.vue`, `pages/index`, `pages/user` | the footer 版权 line and its image |
| `getCustomerType` | `components/kefuIcon`, three DIY components, 订单详情 | which 客服 entry to show (在线客服 / 电话 / 企业微信) and its target |
| `getOpenAdv` | `pages/guide` | the splash advert: image, link, seconds |

Without them: the app shows its own bundled logo, no copyright line, the
generic share card, a 客服 button that goes nowhere, and `pages/guide` renders a
blank splash before it times out.

**Ask:** one public route rather than six, since they are one row in the console
anyway:

```
GET /api/v1/site/config        auth: 'public'
-> {
     name, logo, copyright: { text, imageUrl },
     share:    { title, image, summary },
     payments: { wechat: bool, alipay: bool },
     support:  { kind: 'none'|'phone'|'work-wechat'|'link', value },
     splashAd: { imageUrl, link, seconds } | null,
     version                                   // so the app can cache it
   }
```

H will fan it out to the six legacy shapes in a mapper and cache it for the
session; the pages do not need to change. If F1 would rather keep the console's
group names, `GET /api/v1/site/config?groups=basic,share,support` answering the
raw key/value groups works too — it just moves the naming decision into H.

Note that `GET /api/v1/agreements/:key` already exists and is live in the app,
which is the precedent for a public read of operator-authored text.

## The eighth call: 图片转 base64

`imageBase64` (`api/public.js`) and `imgToBase` (`api/user.js`) are the same
legacy route under two names, called by the three poster screens
(`goods_combination_details`, `presell_details`, `poster-poster`). The canvas
needs the product image as a data URL: on H5 a cross-origin image taints the
canvas and `canvasToTempFilePath` throws, and in the mini-program a remote URL
cannot be drawn at all without `downloadFile` against a whitelisted domain.

**Ask:** `POST /api/v1/site/image-data-urls`, `auth: 'user-optional'`, body
`{ url }`, answering `{ dataUrl }` — the server fetches and inlines it.

This one is not cosmetic and it is not safe by default: it is a URL the client
names and the server fetches, which is an SSRF primitive. It should refuse
anything that is not an attachment this shop stores (F1 already has
`/admin-api/attachments`, so the check is a lookup, not a URL regex), and cap
the size. The legacy route fetched whatever it was handed.

If F1 would rather not carry it, the alternative is a per-shop image-domain
whitelist in the mini-program console plus `uni.downloadFile`, which works on MP
but not on H5 — the posters would lose the product photo on the web.

## Until then

All eight stay `CONTRACT-PENDING(F1)`: `basicConfig`, `getLogo`, `getShare`,
`imageBase64` in `api/public.js`; `getCrmebCopyRight`, `getCustomerType`,
`getOpenAdv` in `api/api.js`; `imgToBase` in `api/user.js`. Every failure is
caught by the caller — the app runs, it just runs unbranded, and the three
posters draw without the product photo.
