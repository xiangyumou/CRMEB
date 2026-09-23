# CR-3-h3 — the three login-method switches have no source

- **Stream:** H3 (uni-app third pass), raised against system/site config (F4) and storefront auth (E1/E4)
- **Status:** **RESOLVED** by W5T in `8ec309fbf` — derived booleans on `site/config` (orchestrator's decision)
- **Affects:** `next/packages/contracts/src/system/system.site.contract.ts`

Legacy `getMallBasicConfig` (`PublicController::getMallBasicConfig`) answered
three flags the app still branches on, and `GET /api/v1/site/config` carries
none of them:

| Flag                 | Legacy source                    | Read by                                                                                  |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `wechat_status`      | 公众号 appid + secret configured | `libs/login.js` — inside WeChat, H5 goes to `wechat_login` instead of `login`            |
| `wechat_auth_switch` | `routine_auth_type` contains 1   | `libs/login.js` (MP: `wechat_login` vs `binding_phone`), `wechat_login`, `binding_phone` |
| `phone_auth_switch`  | `routine_auth_type` contains 2   | `wechat_login` — shows 手机号登录                                                        |

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

## Resolution (W5T, `8ec309fbf`)

`GET /api/v1/site/config` answers `auth: { wechatOa, wechatMini, phone }`
(`next/packages/contracts/src/system/schemas.ts`), booleans only:

| flag         | true when                                                                                                                                                                                                     | registered by                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `wechatOa`   | `wechat-oa.enabled` **and** `wechat.oaAppId` **and** `wechat.oaAppSecret`                                                                                                                                     | `registerWechatDomain()` (`core/src/wechat/wechat.site-auth.ts`) |
| `wechatMini` | `wechat-mini.enabled` **and** `wechat.miniAppId` **and** `wechat.miniAppSecret`                                                                                                                               | `registerWechatDomain()`                                         |
| `phone`      | a sender is registered (tests, `SHOP_FAKE_SMS`), or `sms` is Aliyun with key id, key secret and sign name — `resolveSender`'s rule, extracted as `smsProviderConfigured` and called by `resolveSender` itself | `registerSmsDomain()` (`core/src/sms/index.ts`)                  |

- The 启用 switch is part of both WeChat flags on top of "app id and secret":
  E1's `oaApp` / `miniApp` refuse with `AUTH_WECHAT_NOT_CONFIGURED` when it is
  off, so a flag without it would send the shopper to a login page whose one
  button fails.
- Same inversion as `payments.wechat`: `system` gains `registerSiteAuthMethod`,
  and `wechat` / `sms` hand it probes from explicit `register<Name>Domain()`
  registrars (picked up by `pnpm gen`). Not at import: `wechat/index.ts` is
  reached from inside `system`'s own import graph (via `payment`) and saw a
  half-evaluated `system`. Each probe names its groups, so saving `sms`,
  `wechat` or `wechat-oa` drops the payload cache like `site` does. Cache key
  bumped to `site:config:v2`.
- uni-app `toLegacyBasicConfig`: `wechat_status: boolean`,
  `wechat_auth_switch` / `phone_auth_switch: 1 | 0` — the legacy spelling
  (`PublicController::getMallBasicConfig`).
- `routine_auth_type` stays dropped in the ETL: nothing is chosen, both MP
  flows survive and are offered by what is configured.
