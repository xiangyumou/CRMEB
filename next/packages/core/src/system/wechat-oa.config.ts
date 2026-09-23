import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `wechat-oa` — 公众号 message-callback settings.
 *
 * Legacy source: `eb_system_config` tabs 2 / 130 / 131 (公众号配置).
 * Consumed by stream E3; this stream only owns the screen.
 *
 * **The app credentials are not here.** `appId` / `appSecret` used to be
 * declared in this group *and* in stream C's `wechat` group, both mapping the
 * legacy keys `wechat_appid` / `wechat_appsecret` — so a migrated shop held the
 * app id in one screen and a blank in the other, and whichever screen was saved
 * last won. CR-1-j settled it: the `wechat` group owns the credentials
 * (`getWechatClient` already reads them), and this group keeps only what an
 * operator types into 公众平台 for the message callback.
 *
 * `token` and `encodingAesKey` are **secrets**: the descriptor endpoint sends a boolean
 * "is set" flag, the save endpoint ignores the flag coming back, and it is
 * never logged. The old admin rendered it into an input box.
 */
export const wechatOaConfig = defineConfigGroup({
  group: 'wechat-oa',
  title: '微信公众号',
  permission: 'system:config:read',
  schema: z.object({
    enabled: z.boolean().default(false),
    /** Token the WeChat server echoes back when verifying the callback URL. */
    token: z.string().max(64).default(''),
    encodingAesKey: z.string().max(64).default(''),
    /** 明文 / 兼容 / 安全, spelled as words rather than the legacy 0/1/2. */
    messageMode: z.enum(['plain', 'compatible', 'safe']).default('plain'),
    /** Verification file WeChat asks to be served at the site root. */
    verificationFile: z.string().max(128).default(''),
  }),
  ui: {
    enabled: {
      label: '启用公众号',
      type: 'switch',
      help: 'AppID / AppSecret 在「微信公众号 / 小程序」里填写',
      order: 1,
    },
    // Secret (CR-8-k2): in 明文模式 this token is the whole of the callback's
    // authentication, so a settings *reader* who can see it can forge any
    // follow, scan or message. The form shows "已设置" and a blank save keeps
    // the stored value, as for `encodingAesKey`.
    token: { label: '验证 Token', type: 'password', secret: true, order: 4 },
    messageMode: {
      label: '消息加解密方式',
      type: 'select',
      options: [
        { label: '明文模式', value: 'plain' },
        { label: '兼容模式', value: 'compatible' },
        { label: '安全模式', value: 'safe' },
      ],
      order: 5,
    },
    encodingAesKey: {
      label: 'EncodingAESKey',
      type: 'password',
      secret: true,
      help: '仅安全模式/兼容模式需要',
      visibleWhen: { key: 'messageMode', equals: ['compatible', 'safe'] },
      order: 6,
    },
    verificationFile: { label: '域名校验文件名', type: 'text', order: 7 },
  },
  legacyKeys: {
    token: 'wechat_token',
    encodingAesKey: 'wechat_encodingaeskey',
    messageMode: 'wechat_encode',
    verificationFile: 'weixin_ckeck_file',
  },
});
