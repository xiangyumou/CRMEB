import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `wechat-oa-runtime` — the parts of Official Account behaviour that are ours
 * rather than WeChat's.
 *
 * The credentials are **not** here. They live in two groups this stream does
 * not own and deliberately does not duplicate:
 *
 * | What | Group | Owner |
 * | --- | --- | --- |
 * | `appId` / `appSecret`, API base URL | `wechat` | stream C |
 * | operator-facing token, EncodingAESKey, 消息加解密方式 | `wechat-oa` | stream F1 |
 *
 * `credentials.ts` reads both and prefers F1's, because that is the screen an
 * operator actually fills in; `wechat.oaToken` is the fallback for an install
 * migrated before F1's screen existed. CR-3-e2 asks for the two to be merged.
 *
 * What is left is genuinely ours: which domains a JS-SDK signature may be
 * issued for, and which subscribe-template ids the storefront should ask
 * permission for at which moment.
 */
export const wechatOaRuntimeConfig = defineConfigGroup({
  group: 'wechat-oa-runtime',
  title: '公众号行为',
  permission: 'system:config:read',
  schema: z.object({
    /**
     * Hosts a JS-SDK signature may be issued for, comma separated.
     *
     * The legacy endpoint signed whatever URL it was handed, which turns our
     * jsapi ticket into a signing oracle for anybody's page. Empty means "only
     * the site's own origin", which is the safe default even though it makes a
     * fresh install answer `WECHAT_OA_URL_NOT_ALLOWED` until somebody fills it
     * in — a visible refusal beats a silent one.
     */
    jsApiAllowedHosts: z.string().max(1024).default(''),
    /**
     * How long a scan may be counted again for the same openid and QR code.
     *
     * WeChat re-delivers a `SCAN` event on every retry and a poster gets
     * photographed and re-scanned by the same phone all afternoon; without a
     * window the counter measures patience rather than reach.
     */
    scanDedupeSeconds: z.number().int().min(0).max(86_400).default(300),
    /** Subscribe-message template ids per storefront scene, comma separated. */
    subscribeOrderCreate: z.string().max(512).default(''),
    subscribeOrderPay: z.string().max(512).default(''),
    subscribeOrderShip: z.string().max(512).default(''),
    subscribeRefund: z.string().max(512).default(''),
  }),
  ui: {
    jsApiAllowedHosts: {
      label: 'JS-SDK 授权域名',
      type: 'text',
      help: '多个域名用英文逗号分隔，留空表示仅允许站点自身域名',
      section: 'JS-SDK',
      order: 10,
    },
    scanDedupeSeconds: {
      label: '扫码去重窗口（秒）',
      type: 'number',
      section: '渠道码',
      order: 20,
    },
    subscribeOrderCreate: {
      label: '下单场景模板 ID',
      type: 'text',
      section: '订阅消息',
      order: 30,
    },
    subscribeOrderPay: { label: '支付场景模板 ID', type: 'text', section: '订阅消息', order: 31 },
    subscribeOrderShip: { label: '发货场景模板 ID', type: 'text', section: '订阅消息', order: 32 },
    subscribeRefund: { label: '退款场景模板 ID', type: 'text', section: '订阅消息', order: 33 },
  },
});

export type WechatOaRuntimeConfig = z.infer<typeof wechatOaRuntimeConfig.schema>;
