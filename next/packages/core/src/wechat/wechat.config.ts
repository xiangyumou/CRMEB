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
    /** The token the OA message callback signs with. */
    oaToken: configText(64),
    /** 43 characters, for the OA's own AES message encryption. Optional: plaintext mode works. */
    oaAesKey: configText(64),
    miniAppId: configText(64),
    miniAppSecret: configText(128),
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
  },
  legacyKeys: {
    oaAppId: 'wechat_appid',
    oaAppSecret: 'wechat_appsecret',
    oaToken: 'wechat_token',
    oaAesKey: 'wechat_encodingaeskey',
    miniAppId: 'routine_appId',
    miniAppSecret: 'routine_appsecret',
  },
});

export type WechatConfig = z.infer<typeof wechatConfig.schema>;
