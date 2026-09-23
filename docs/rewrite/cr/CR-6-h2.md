# CR-6-h2 — the storefront cannot get a mini-program code

**Status (R5 sweep, 2026-09-23): RESOLVED** — `/api/v1/wechat/mini-qrcodes` exists (E4, `53ba7a17a`). The status line below is kept as history.

- **Stream:** H (uni-app storefront), raised against E2 (WeChat OA / mini-program)
- **Status:** open
- **Affects:** `next/packages/contracts/src/wechat-oa/wechat-oa.storefront.contract.ts`

Three screens draw a poster with a scannable code in the middle of it:

| Call | Screen | What the code points at |
| ---- | ------ | ----------------------- |
| `getProductCode` (`api/store.js`) | 商品详情 → 生成海报 | the product page |
| `scombinationCode` (`api/activity.js`) | 拼团详情 → 邀请好友 | the activity, or one team |
| `routineCode` (`api/user.js`) | `poster-poster` | whatever the poster is for |

On H5 the poster is drawn with a QR code the client renders from a URL, and D's
`groupbuyPoster` already hands over a `qrPayload` for exactly that. In the
**mini-program** a QR code is not enough: scanning a URL inside WeChat opens a
browser, not the mini-program, so the poster needs a 小程序码 — and only
`wxacode.getUnlimited` can mint one, which needs the access token and therefore
the server.

The storefront surface has `jssdk-config` and `subscribe-templates` and nothing
else. `/admin-api/wechat-qrcodes` is the OA's parametric QR management screen —
a different code, a different API, and admin-only.

**Ask:** `GET /api/v1/wechat/mini-qrcodes`, `auth: 'user-optional'`, query
`{ scene, id }` where `scene` is a small enum (`product`, `groupbuy`,
`groupbuy-group`, `presale`), answering

```
{ url: string }    // a stored image, not a base64 blob
```

Two things worth fixing while it is being written, both of which the legacy
route got wrong:

- **Cache by `(scene, id)`.** Legacy called `getUnlimited` on every poster open
  and wrote a new attachment row each time, so a popular product accumulated one
  PNG per share. WeChat's own daily quota is 100 000 codes, which that burns
  through on a busy day.
- **`scene` is capped at 32 bytes** by WeChat. `"groupbuy-group:501"` fits; a
  JSON blob does not, which is why the enum plus an id is better than a free
  string.

## Until then

`getProductCode`, `scombinationCode` and `routineCode` stay
`CONTRACT-PENDING(E2)` against `GET /api/v1/wechat/mini-qrcodes`. The H5 posters
still draw (they render the QR client-side); the mini-program posters come out
without a code.
