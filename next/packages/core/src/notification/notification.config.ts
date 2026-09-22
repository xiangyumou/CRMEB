import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `notification` — how the shop's own notifications behave.
 *
 * The credentials are *not* here: the OA and mini-program apps live in F1's
 * `wechat-oa` / `wechat-mini` groups and in C's `wechat` group, and the SMS
 * provider in F1's `sms`. Group names are global, so this stream declares one
 * group and reads the other four.
 *
 * `siteBaseUrl` is a **local adapter for `CR-1-e2`**. Two things need to know
 * the shop's public origin and neither can work it out: a notification link
 * (`/orders/1024` has to become a URL a WeChat template message can open) and
 * the JS-SDK signature endpoint, which must refuse to sign a page that is not
 * ours. F1 deliberately dropped `site_url` from the `site` group because the
 * legacy installer kept rewriting it — the CR asks for it back as a read-only,
 * environment-derived field. Until then it is configured here, and
 * `wechat-oa` reads it through this domain's `index.ts`.
 */
export const notificationConfig = defineConfigGroup({
  group: 'notification',
  title: '通知设置',
  permission: 'system:config:read',
  schema: z.object({
    /**
     * Absolute origin, no trailing slash, e.g. `https://shop.example.com`.
     * Empty disables both the OA link rendering and the JS-SDK endpoint, which
     * is the safe default: signing an unknown origin is worse than not signing.
     */
    siteBaseUrl: z.string().max(255).default(''),
    /**
     * Extra hostnames the JS-SDK endpoint may sign for, comma-separated. A
     * shop often serves the H5 storefront from a second domain that is also
     * registered as a JS 安全域名.
     */
    jsApiExtraHosts: z.string().max(500).default(''),
    /**
     * `mini_program_state` for subscribe messages. `formal` in production;
     * `trial`/`developer` exist because a shop testing a new template
     * otherwise has to choose between not testing and messaging customers.
     */
    miniProgramState: z.enum(['developer', 'trial', 'formal']).default('formal'),
    /** In-app messages older than this are pruned by the nightly job. 0 keeps them forever. */
    retentionDays: z.number().int().min(0).max(3650).default(180),
  }),
  ui: {
    siteBaseUrl: {
      label: '站点公开地址',
      type: 'text',
      help: '例如 https://shop.example.com，用于通知里的链接与 JS-SDK 域名校验',
      order: 1,
    },
    jsApiExtraHosts: {
      label: 'JS-SDK 额外域名',
      type: 'text',
      help: '多个用英文逗号分隔，需与公众号的 JS 安全域名一致',
      order: 2,
    },
    miniProgramState: {
      label: '小程序版本',
      type: 'select',
      options: [
        { label: '正式版', value: 'formal' },
        { label: '体验版', value: 'trial' },
        { label: '开发版', value: 'developer' },
      ],
      order: 3,
    },
    retentionDays: { label: '站内信保留天数', type: 'number', help: '0 表示永久保留', order: 4 },
  },
});

export type NotificationConfig = z.infer<typeof notificationConfig.schema>;
