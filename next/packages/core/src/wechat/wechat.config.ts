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
 * A stored string that survives the round trip through `config_values.value`.
 *
 * The column is `jsonb` and the driver sends a JavaScript string straight
 * through as the jsonb literal, so an all-digit value such as a phone number is
 * stored as a jsonb **number**, `z.string()` then refuses it, and
 * `ConfigService.get` repairs the field back to its default. `CR-6-c` asks for
 * the one-line fix in `kernel/config.repo.ts`; until it lands, the text fields
 * in the groups this stream owns take the number back.
 */
const configText = (max: number) =>
  z
    .preprocess((value) => (typeof value === 'number' ? String(value) : value), z.string().max(max))
    .default('');

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
    apiBaseUrl: z
      .preprocess(
        (value) => (typeof value === 'number' ? String(value) : value),
        z.string().max(255),
      )
      .default('https://api.weixin.qq.com'),
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
