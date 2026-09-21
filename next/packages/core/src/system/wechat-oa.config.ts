import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `wechat-oa` — 公众号 credentials and message-encryption settings.
 *
 * Legacy source: `eb_system_config` tabs 2 / 130 / 131 (公众号配置).
 * Consumed by stream E2; this stream only owns the screen.
 *
 * `appSecret` and `encodingAesKey` are **secrets**: the descriptor endpoint
 * sends a boolean "is set" flag, the save endpoint ignores the flag coming back,
 * and neither is ever logged. The old admin rendered them into an input box.
 */
export const wechatOaConfig = defineConfigGroup({
  group: 'wechat-oa',
  title: '微信公众号',
  permission: 'system:config:read',
  schema: z.object({
    enabled: z.boolean().default(false),
    appId: z.string().max(64).default(''),
    appSecret: z.string().max(128).default(''),
    /** Token the WeChat server echoes back when verifying the callback URL. */
    token: z.string().max(64).default(''),
    encodingAesKey: z.string().max(64).default(''),
    /** 明文 / 兼容 / 安全, spelled as words rather than the legacy 0/1/2. */
    messageMode: z.enum(['plain', 'compatible', 'safe']).default('plain'),
    /** Verification file WeChat asks to be served at the site root. */
    verificationFile: z.string().max(128).default(''),
  }),
  ui: {
    enabled: { label: '启用公众号', type: 'switch', order: 1 },
    appId: { label: 'AppID', type: 'text', order: 2 },
    appSecret: { label: 'AppSecret', type: 'password', secret: true, order: 3 },
    token: { label: '验证 Token', type: 'text', order: 4 },
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
    appId: 'wechat_appid',
    appSecret: 'wechat_appsecret',
    token: 'wechat_token',
    encodingAesKey: 'wechat_encodingaeskey',
    messageMode: 'wechat_encode',
    verificationFile: 'weixin_ckeck_file',
  },
});
