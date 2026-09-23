import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `wechat-mini` — how the 小程序 behaves, **not** what it signs in with.
 *
 * Every WeChat credential lives in the `wechat` group and nowhere else. A
 * credential claimed by two groups shows on one settings screen and as a blank
 * on the other, and whichever is saved last wins. So the AppID, the AppSecret,
 * the callback token, the AES key and the message mode are all `wechat`'s
 * (`miniAppId`, `miniAppSecret`, `miniToken`, `miniAesKey`, `miniMessageMode`),
 * and this group keeps the two things that are about the shop rather than the
 * app: is the mini program switched on, and how does 联系客服 behave.
 *
 * Readers: the mini-program sign-in checks `enabled` here and reads the app id
 * from `wechat`; the storefront reads `contactType` / `contactPhone`.
 */
export const wechatMiniConfig = defineConfigGroup({
  group: 'wechat-mini',
  title: '微信小程序',
  permission: 'system:config:read',
  schema: z.object({
    enabled: z.boolean().default(false),
    name: z.string().max(64).default(''),
    /**
     * How 联系客服 behaves: the mini-program's own chat window, or a phone
     * number. There is no self-hosted 自建客服 (out of scope), so there is no
     * third option.
     */
    contactType: z.enum(['mini-program', 'phone']).default('mini-program'),
    contactPhone: z.string().max(32).default(''),
  }),
  ui: {
    enabled: {
      label: '启用小程序',
      type: 'switch',
      help: 'AppID 与 AppSecret 在「微信公众号 / 小程序」设置中填写',
      order: 1,
    },
    name: { label: '小程序名称', type: 'text', order: 2 },
    contactType: {
      label: '联系客服方式',
      type: 'select',
      options: [
        { label: '小程序客服', value: 'mini-program' },
        { label: '拨打电话', value: 'phone' },
      ],
      order: 8,
    },
    contactPhone: {
      label: '客服电话',
      type: 'text',
      help: '「拨打电话」时使用',
      visibleWhen: { key: 'contactType', equals: 'phone' },
      order: 9,
    },
  },
});
