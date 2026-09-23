import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * The `wechat` config group: the Official Account and mini-program app
 * credentials.
 *
 * It lives with the domain that reads it rather than under `system/config/`: a
 * shared folder every domain writes into would tie them all to `system`.
 * Registration is a side effect of importing this module, which
 * `wechat/index.ts` does.
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
 * `config_values.value` is `jsonb`, and a string written to it must come back a
 * string even when it is all digits — a 商户号, a phone number. Parsing the
 * value twice on the way out would turn it into a *number*; `@shop/db` has json
 * and jsonb reach drizzle as text and parses them once, so this is a plain
 * string. The round trip is covered by a test in every group this domain owns,
 * because the failure mode is silent: the field falls back to its default and
 * the shop reports 支付尚未配置 with a filled-in form.
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
     * These two are the one WeChat credential pair this group is **not** the
     * home of. The `system` domain's `wechat-oa` group declares the same
     * settings, and it is the screen 公众号消息配置 lives on; with two equal
     * homes the operator would edit one screen and the other would keep a stale
     * copy. The fields stay declared here so an install that only ever filled
     * in this screen keeps working: `oaCredentials()` reads the `wechat-oa`
     * group first and falls back to these.
     */
    oaToken: configText(64),
    oaAesKey: configText(64),
    miniAppId: configText(64),
    miniAppSecret: configText(128),
    /**
     * The token and AES key of the mini program's own message callback, and
     * the mode it is configured in.
     *
     * They sit here because this group holds every WeChat credential. **Nothing
     * reads them yet**: 自建客服 and the mini-program message callback are out
     * of scope, so there is no callback to verify a signature for. They are
     * kept rather than dropped so an operator who has the values can store them
     * once, next to the rest, and not have to find them again when a callback
     * arrives.
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
});

export type WechatConfig = z.infer<typeof wechatConfig.schema>;
