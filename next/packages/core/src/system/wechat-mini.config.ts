import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';
import { defineConfigFieldExtras } from './config-ui-extras';

/**
 * `wechat-mini` — 小程序 credentials.
 *
 * Legacy source: `eb_system_config` tabs 7 / 132 / 133 (小程序配置).
 * Consumed by E1 (login) and E2 (subscribe messages).
 */
export const wechatMiniConfig = defineConfigGroup({
  group: 'wechat-mini',
  title: '微信小程序',
  permission: 'system:config:read',
  schema: z.object({
    enabled: z.boolean().default(false),
    name: z.string().max(64).default(''),
    appId: z.string().max(64).default(''),
    appSecret: z.string().max(128).default(''),
    token: z.string().max(64).default(''),
    encodingAesKey: z.string().max(64).default(''),
    messageMode: z.enum(['plain', 'compatible', 'safe']).default('plain'),
    /**
     * How 联系客服 behaves: the mini-program's own chat window, or a phone
     * number. 自建客服 is not ported (scope guard), so there is no third option.
     */
    contactType: z.enum(['mini-program', 'phone']).default('mini-program'),
    contactPhone: z.string().max(32).default(''),
  }),
  ui: {
    enabled: { label: '启用小程序', type: 'switch', order: 1 },
    name: { label: '小程序名称', type: 'text', order: 2 },
    appId: { label: 'AppID', type: 'text', order: 3 },
    appSecret: { label: 'AppSecret', type: 'password', secret: true, order: 4 },
    token: { label: '验证 Token', type: 'text', order: 5 },
    messageMode: {
      label: '消息加解密方式',
      type: 'select',
      options: [
        { label: '明文模式', value: 'plain' },
        { label: '兼容模式', value: 'compatible' },
        { label: '安全模式', value: 'safe' },
      ],
      order: 6,
    },
    encodingAesKey: { label: 'EncodingAESKey', type: 'password', secret: true, order: 7 },
    contactType: {
      label: '联系客服方式',
      type: 'select',
      options: [
        { label: '小程序客服', value: 'mini-program' },
        { label: '拨打电话', value: 'phone' },
      ],
      order: 8,
    },
    contactPhone: { label: '客服电话', type: 'text', help: '「拨打电话」时使用', order: 9 },
  },
  legacyKeys: {
    name: 'routine_name',
    appId: 'routine_appId',
    appSecret: 'routine_appsecret',
    token: 'routine_token',
    encodingAesKey: 'routine_encodingaeskey',
    messageMode: 'routine_encode',
    contactType: 'routine_contact_type',
  },
});

defineConfigFieldExtras('wechat-mini', {
  contactPhone: { visibleWhen: { key: 'contactType', equals: 'phone' } },
  encodingAesKey: { visibleWhen: { key: 'messageMode', equals: ['compatible', 'safe'] } },
});
