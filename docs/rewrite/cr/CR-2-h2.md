# CR-2-h2 — three surfaces the uni-app has and E1's contract does not

- **Stream:** H (uni-app storefront), raised against E1 (user, storefront auth)
- **Status:** open
- **Affects:** `next/packages/contracts/src/auth/auth.storefront.contract.ts`

The auth contract covers sign-in thoroughly — the rest of `api/user.js`,
`api/api.js` and `api/public.js` now maps onto it one-for-one. Three things are
left over: two auth screens, and 商家管理's 用户 tab, which B2 assigned to E1
when it built the staff surface for orders. None of them is a legacy quirk.

## 1. The behaviour captcha (滑块 / 点选)

`pages/users/components/verify/**` and `pages/annex/components/verify/**` are a
complete behaviour-captcha frontend: `verifySlider`, `verifySliderPc` and
`verifyPoint`, each driving two calls —

- issue a challenge (background image, sliding block, or the characters to click), and
- check the answer, which returns the token the next call quotes.

Every SMS send goes through it: `code()` opens the slider, and only its
`success` callback calls `registerVerify`. `sendSmsCodeBody.captchaToken` is
already in the contract — "present once the slider captcha is switched on;
ignored while it is off" — so the *output* has a home. There is nothing to
produce it.

**Ask:** two public routes, e.g.

```
POST /api/v1/auth/captcha            { type: 'slider' | 'point' }
  -> { captchaId, backgroundImage, blockImage?, prompt?, blockY? }
POST /api/v1/auth/captcha/verifications
     { captchaId, answer }           // x offset, or the clicked points
  -> { captchaToken, expiresInSec }
```

`captchaToken` being exactly what `sendSmsCodeBody.captchaToken` and
`passwordLoginBody.captchaToken` already accept is the whole point: nothing else
in the contract changes.

If E1 would rather not carry a captcha at all, say so and H will delete the
three verify components and have `code()` call `registerVerify` directly — the
rate limits behind `AUTH_SMS_TOO_FREQUENT` are the real defence anyway, and the
slider only ever raised the cost of a script by a few seconds.

## 2. 小程序一键绑定手机号, for an account that is already signed in

`pages/user/index.vue` and `pages/users/user_info/index.vue` both render WeChat's
`<button open-type="getPhoneNumber">` for a shopper who is **already signed in**
and has no phone bound. The callback hands over `e.detail.code`, a code the
server redeems.

Neither existing route fits:

- `POST /api/v1/auth/phone` binds a phone, but its proof is a typed SMS code —
  and the whole point of this button is that the shopper types nothing.
- `POST /api/v1/auth/sessions/wechat-mini/phone` takes exactly the right
  `phoneCode`, but it is a *sign-in*: it takes a `bindToken` minted by a
  `phone-required` login, not the caller's session, and it would mint a second
  session for somebody who already has one.

**Ask:** `POST /api/v1/auth/phone/wechat-mini`, `auth: 'user'`, body
`{ phoneCode }`, response `{ ok: true }` — the `getPhoneNumber` sibling of
`authBindPhone`, with the same `AUTH_PHONE_TAKEN` / `AUTH_PHONE_ALREADY_BOUND`
errors.

## 3. 商家管理 → 用户: a whole screen with no staff surface

B2 built `/api/v1/staff/*` for orders and refunds and its status file hands the
用户 screens to E1. They are six calls in `api/admin.js`, behind
`pages/admin/user/**` — a list, a detail, and two drawers (分组, 标签):

| Call | Screen | Admin route that already does it |
| ---- | ------ | -------------------------------- |
| `getUserList` | `admin/user/list.vue` | `GET /admin-api/users` |
| `getUserInfo` | `admin/user/index.vue` | `GET /admin-api/users/:id` |
| `getGroupList` | both | `GET /admin-api/user-groups` |
| `postUserSetGroup` | both | `POST /admin-api/users/group-assignments` |
| `getUserLabel` | `components/{filter,userLable}` | `GET /admin-api/user-labels` |
| `postUserSetLabel` | `components/userLable`, `list.vue` | `POST /admin-api/users/label-assignments` |

Every one of them exists for an **admin session**. A 店员 has a shopper session
with a staff role on it, which is why B2 minted `/api/v1/staff/orders` rather
than pointing the phone at `/admin-api/orders`.

**Ask:** the same six under `/api/v1/staff/`, `auth: 'staff'`, reusing E1's
schemas:

```
GET  /api/v1/staff/users              ?page&pageSize&keyword&groupId&labelId
GET  /api/v1/staff/users/:uid
GET  /api/v1/staff/user-groups
POST /api/v1/staff/users/:uid/group   { groupId }
GET  /api/v1/staff/users/:uid/labels
POST /api/v1/staff/users/:uid/labels  { labelId }
```

One thing to decide rather than copy: **how much of a customer a 店员 may see.**
The admin detail carries the phone number, the address book
(`/admin-api/users/:id/addresses`), the spend total and the account status. A
phone in a shop assistant's hand is a different threat model from a console
behind an office login, and the legacy screen showed all of it. H renders
whatever the route returns, so the narrower the response the better.

## Until then

1. `getAjcaptcha` / `ajcaptchaCheck` (`api/api.js`) stay `CONTRACT-PENDING(E1)`
   against `/api/v1/auth/captcha` and `/api/v1/auth/captcha/verifications`. The
   slider fails to load, so **no SMS code can be sent on any screen** — 手机号登录,
   注册, 找回密码, 绑定/更换手机号. This is the single largest blocked surface H2
   leaves behind.
2. `mpBindingPhone` (`api/user.js`) stays `CONTRACT-PENDING(E1)` against
   `/api/v1/auth/phone/wechat-mini`. Both pages now pass `{phoneCode}` — the
   `encryptedData` + `iv` client-side decryption is gone either way, since it
   needed `session_key` to leave the server.
3. The six 用户管理 calls stay `CONTRACT-PENDING(E1)` against
   `/api/v1/staff/users*`. `pages/admin/user/**` loads an empty list and both
   drawers fail; 商家管理's 订单 and 售后 tabs are unaffected.
