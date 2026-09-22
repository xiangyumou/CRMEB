import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `storefront-auth` — how the shop's own sign-in behaves.
 *
 * Distinct from F1's `sms` group, which holds the *provider*: an operator who
 * changes SMS vendor does not want to re-decide how long a login code lives,
 * and an operator lengthening the code's life has no business near an
 * AccessKeySecret. The groups are also read by different domains.
 *
 * Legacy sources: `verify_expire_time` (a *minutes* value, default 1),
 * `sms.maxMinuteCount` / `maxPhoneCount` / `maxIpCount` hard-coded at
 * `LoginController.php:117-140`, and `LoginThrottleGuard::WINDOW = 900`.
 * The per-phone budgets moved to the `sms` group where F1 had already put
 * them; only the per-IP one is here, because it is a login-abuse control
 * rather than a spend control.
 *
 * Every field has a default: a fresh install must be able to sign somebody in
 * before anybody has opened this form.
 */
export const storefrontAuthConfig = defineConfigGroup({
  group: 'storefront-auth',
  title: '商城登录',
  permission: 'system:config:read',
  schema: z.object({
    /**
     * Absolute site URL, e.g. `https://shop.example.com`. It is the allowlist
     * for the WeChat OAuth `redirectUrl` and the base of the callback we hand
     * to WeChat. Empty disables OA sign-in rather than trusting whatever the
     * client sent — an open redirect on the authorisation endpoint gives the
     * `code` to whoever asked for it.
     */
    siteUrl: z.string().max(255).default(''),

    /** Seconds. The legacy default was 60, which is not enough time to read an SMS. */
    codeTtlSec: z.number().int().min(60).max(1800).default(300),
    /** Seconds before the same number may ask again, in the same scene. */
    codeResendSec: z.number().int().min(30).max(600).default(60),
    /** Wrong guesses a single minted code survives before it is destroyed. */
    codeMaxAttempts: z.number().int().min(3).max(10).default(5),
    /** Codes one source address may trigger per day. */
    codePerIpPerDay: z.number().int().min(10).max(1000).default(50),

    /**
     * Failed sign-ins per account per window, and per account+address per
     * window. Two counters, not one: the address is shared by everybody behind
     * the proxy, so it can only ever be a secondary signal.
     */
    loginMaxAttempts: z.number().int().min(3).max(50).default(5),
    loginWindowSec: z.number().int().min(60).max(3600).default(900),

    /** How long a storefront bearer token lives. */
    sessionTtlDays: z.number().int().min(1).max(365).default(30),

    /**
     * Whether a WeChat sign-in must end with a bound phone number before it
     * becomes a session. Off means an openid alone is an account, which is
     * convenient and makes support tickets unanswerable.
     */
    requirePhoneForWechat: z.boolean().default(true),

    /** Applied to accounts created without one. Empty means the client's own placeholder. */
    defaultAvatar: z.string().max(512).default(''),

    /** Live addresses one customer may keep. */
    addressLimit: z.number().int().min(1).max(200).default(20),
  }),
  ui: {
    siteUrl: {
      label: '站点地址',
      type: 'text',
      help: '如 https://shop.example.com，用于微信授权回调校验',
      section: '站点',
      order: 1,
    },

    codeTtlSec: { label: '验证码有效期（秒）', type: 'number', section: '短信验证码', order: 10 },
    codeResendSec: {
      label: '重新发送间隔（秒）',
      type: 'number',
      section: '短信验证码',
      order: 11,
    },
    codeMaxAttempts: {
      label: '单条验证码可试次数',
      type: 'number',
      section: '短信验证码',
      order: 12,
    },
    codePerIpPerDay: { label: '每 IP 每天上限', type: 'number', section: '短信验证码', order: 13 },

    loginMaxAttempts: { label: '登录失败次数上限', type: 'number', section: '登录保护', order: 20 },
    loginWindowSec: { label: '统计窗口（秒）', type: 'number', section: '登录保护', order: 21 },
    sessionTtlDays: { label: '登录保持天数', type: 'number', section: '登录保护', order: 22 },

    requirePhoneForWechat: {
      label: '微信登录强制绑定手机号',
      type: 'switch',
      section: '微信登录',
      order: 30,
    },

    defaultAvatar: { label: '默认头像', type: 'text', section: '资料', order: 40 },
    addressLimit: { label: '收货地址数量上限', type: 'number', section: '资料', order: 41 },
  },
  // `verify_expire_time` is deliberately **not** mapped. The legacy value is in
  // *minutes* and defaults to 1; copying it across would set the code TTL to one
  // second and break every login on the day of the migration. The same class of
  // mistake as F1's `order_cancel_time`, but with no unit hint in the key name,
  // so the safe move is to take the new default.
  legacyKeys: {
    defaultAvatar: 'h5_avatar',
    siteUrl: 'site_url',
  },
});

export type StorefrontAuthConfig = z.infer<typeof storefrontAuthConfig.schema>;
