import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * The `wechat` config group: the Official Account and mini-program app
 * credentials.
 *
 * It lives here rather than under `system/config/` because that folder belongs
 * to stream F1 and fifteen domains writing into it is a merge conflict per
 * domain (CR-2-c). Registration is a side effect of importing this module,
 * which `wechat/index.ts` does.
 *
 * Every field has a `.default()`: a fresh install must be able to read the
 * group before anybody has saved it, or the shop cannot boot.
 *
 * Secrets carry `secret: true`, which means the admin form receives an "is set"
 * boolean and plaintext travels back only when an operator retypes it. Nothing
 * in this file is ever logged: `wechat.client.ts` redacts by never putting a
 * credential into a log object in the first place.
 */

/**
 * A stored text setting.
 *
 * `config_values.value` is `jsonb`, and for a while a string written to it came
 * back as a *number* whenever it was all digits — a 商户号, a phone number —
 * because the value was parsed twice on the way out. `CR-6-c` is fixed in
 * `@shop/db` (json and jsonb reach drizzle as text and are parsed once), so this
 * is now a plain string again. The round trip is still covered by a test in
 * every group this stream owns, because the failure mode was silent: the field
 * fell back to its default and the shop reported 支付尚未配置 with a filled-in
 * form.
 */
const configText = (max: number) => z.string().max(max).default('');

export const wechatConfig = defineConfigGroup({
  group: 'wechat',
  title: '微信公众号 / 小程序',
  permission: 'payment:config:write',
  schema: z.object({
    oaAppId: configText(64),
    oaAppSecret: configText(128),
    /**
     * The token the OA message callback signs with, and the 43-character AES
     * key for its message encryption (optional: plaintext mode works).
     *
     * These two are the one WeChat credential pair this group does **not** own
     * the legacy keys for. F1's `wechat-oa` group declares the same settings
     * and maps `wechat_token` / `wechat_encodingaeskey`, and a legacy key with
     * two claimants is the CR-1-j bug: the ETL fans the value out to both
     * groups, the operator edits one screen, and the other keeps a stale copy.
     * CR-3-e2 closes here by making F1's group the sole claimant — it is the
     * screen 公众号消息配置 lives on — while the fields stay declared here so
     * an install that only ever filled in this screen keeps working.
     * `oaCredentials()` reads F1's first and falls back to these.
     */
    oaToken: configText(64),
    oaAesKey: configText(64),
    miniAppId: configText(64),
    miniAppSecret: configText(128),
    /**
     * The token and AES key of the mini program's own message callback, and
     * the mode it is configured in.
     *
     * They came over from F1's `wechat-mini` group when this group took over
     * every WeChat credential (CR-1-j, extended to the mini program by E4).
     * **Nothing reads them yet**: the mini-program message push is not ported
     * (scope guard — 自建客服 and the mini message callback are out), so there
     * is no callback to verify a signature for. They are carried rather than
     * dropped because a migrated shop has the values in
     * `routine_token` / `routine_encodingaeskey` / `routine_encode` and the ETL
     * refuses a legacy key that nobody claims and nobody dropped: losing them
     * would mean retyping credentials that the operator can no longer read off
     * the old admin.
     */
    miniToken: configText(64),
    miniAesKey: configText(64),
    miniMessageMode: z.enum(['plain', 'compatible', 'safe']).default('plain'),
    /**
     * `api.weixin.qq.com`, overridable so integration tests can point the whole
     * client at a local fake. Never settable from the admin UI: it has no `ui`
     * entry, so `ConfigGroupForm` does not render it.
     */
    apiBaseUrl: z.string().max(255).default('https://api.weixin.qq.com'),
  }),
  ui: {
    oaAppId: { label: '公众号 AppID', type: 'text', section: '公众号', order: 10 },
    oaAppSecret: {
      label: '公众号 AppSecret',
      type: 'password',
      secret: true,
      section: '公众号',
      order: 20,
    },
    oaToken: {
      label: '消息校验 Token',
      type: 'password',
      secret: true,
      section: '公众号',
      order: 30,
    },
    oaAesKey: {
      label: '消息加解密密钥',
      type: 'password',
      secret: true,
      help: '留空表示使用明文模式',
      section: '公众号',
      order: 40,
    },
    miniAppId: { label: '小程序 AppID', type: 'text', section: '小程序', order: 10 },
    miniAppSecret: {
      label: '小程序 AppSecret',
      type: 'password',
      secret: true,
      section: '小程序',
      order: 20,
    },
    miniToken: {
      label: '小程序消息 Token',
      type: 'password',
      secret: true,
      help: '小程序消息推送尚未启用，此处仅保留迁移过来的值',
      section: '小程序',
      order: 30,
    },
    miniMessageMode: {
      label: '小程序消息加解密方式',
      type: 'select',
      options: [
        { label: '明文模式', value: 'plain' },
        { label: '兼容模式', value: 'compatible' },
        { label: '安全模式', value: 'safe' },
      ],
      section: '小程序',
      order: 40,
    },
    miniAesKey: {
      label: '小程序 EncodingAESKey',
      type: 'password',
      secret: true,
      visibleWhen: { key: 'miniMessageMode', equals: ['compatible', 'safe'] },
      section: '小程序',
      order: 50,
    },
  },
  legacyKeys: {
    oaAppId: 'wechat_appid',
    oaAppSecret: 'wechat_appsecret',
    // `wechat_token` / `wechat_encodingaeskey` are deliberately absent: they
    // belong to F1's `wechat-oa` group alone (see `oaToken` above, CR-3-e2).
    miniAppId: 'routine_appId',
    miniAppSecret: 'routine_appsecret',
    miniToken: 'routine_token',
    miniAesKey: 'routine_encodingaeskey',
    miniMessageMode: 'routine_encode',
  },
});

export type WechatConfig = z.infer<typeof wechatConfig.schema>;
