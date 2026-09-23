# CR-3-h3 — the three login-method switches have no source

- **Stream:** H3 (uni-app third pass), raised against system/site config (F4) and storefront auth (E1/E4)
- **Status:** open
- **Affects:** `next/packages/contracts/src/system/system.site.contract.ts`

Legacy `getMallBasicConfig` (`PublicController::getMallBasicConfig`) answered
three flags the app still branches on, and `GET /api/v1/site/config` carries
none of them:

| Flag | Legacy source | Read by |
| ---- | ------------- | ------- |
| `wechat_status` | 公众号 appid + secret configured | `libs/login.js` — inside WeChat, H5 goes to `wechat_login` instead of `login` |
| `wechat_auth_switch` | `routine_auth_type` contains 1 | `libs/login.js` (MP: `wechat_login` vs `binding_phone`), `wechat_login`, `binding_phone` |
| `phone_auth_switch` | `routine_auth_type` contains 2 | `wechat_login` — shows 手机号登录 |

`routine_auth_type` is in the ETL's dropped list as 「新代码按需推导：小程序登录只剩
一种流程」, which says the answer is derived but not which flow survived.

Today all three read as absent (`undefined`), exactly as before `site/config`
existed: the mini-program always sends a signed-out shopper to
`binding_phone` (phone + SMS), and an H5 visitor inside WeChat gets the plain
login page, never the 公众号 one-tap login — even when both are configured.

**Ask:** either add `auth: { wechatOa: boolean, wechatMini: boolean, phone:
boolean }` to `GET /api/v1/site/config` (derived, never a credential — the same
rule as `payments.wechat`), or state which flow the mini-program keeps and H
hard-codes it in `toLegacyBasicConfig`.
