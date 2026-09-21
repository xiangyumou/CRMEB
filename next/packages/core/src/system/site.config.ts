import { z } from 'zod';
import { defineConfigGroup } from '../kernel/config-registry';

/**
 * `site` — the shop's own identity: name, logos, filing numbers, contact and
 * the defaults used when a page is shared into WeChat.
 *
 * Legacy source: `eb_system_config` tab 1 (基础配置), 122 (LOGO配置),
 * 125 (备案配置) and 70 (分享配置). `site_url` is **not** here: the old value
 * was rewritten by the installer and by the SSL screen, and the new deployment
 * takes the origin from the environment, where it belongs.
 *
 * Every field has a `.default()`, without exception — `defineConfigGroup`
 * refuses a group that cannot be read before anybody has saved it, because a
 * fresh install has to boot.
 */
export const siteConfig = defineConfigGroup({
  group: 'site',
  title: '站点设置',
  permission: 'system:config:read',
  schema: z.object({
    siteName: z.string().max(64).default('CRMEB 商城'),
    siteKeywords: z.string().max(255).default(''),
    siteDescription: z.string().max(500).default(''),
    contactPhone: z.string().max(32).default(''),
    companyAddress: z.string().max(255).default(''),

    logo: z.string().max(512).default(''),
    logoSquare: z.string().max(512).default(''),
    loginLogo: z.string().max(512).default(''),
    favicon: z.string().max(512).default(''),

    /** 备案号, shown in the storefront footer next to `icpUrl`. */
    icpNumber: z.string().max(64).default(''),
    icpUrl: z.string().max(255).default('https://beian.miit.gov.cn/'),
    /** 公安备案号 and the link it points at. */
    publicSecurityNumber: z.string().max(64).default(''),
    publicSecurityUrl: z.string().max(255).default(''),

    /** Customer-service QR code shown on the 联系我们 page. */
    contactQrcode: z.string().max(512).default(''),
    /** The shop's own QR code, for posters. */
    shareQrcode: z.string().max(512).default(''),

    shareTitle: z.string().max(64).default(''),
    shareSummary: z.string().max(255).default(''),
    shareImage: z.string().max(512).default(''),
  }),
  ui: {
    siteName: { label: '商城名称', type: 'text', section: '基础', order: 1 },
    siteKeywords: { label: '站点关键词', type: 'text', section: '基础', order: 2 },
    siteDescription: { label: '站点描述', type: 'textarea', section: '基础', order: 3 },
    contactPhone: { label: '联系电话', type: 'text', section: '基础', order: 4 },
    companyAddress: { label: '公司地址', type: 'text', section: '基础', order: 5 },

    logo: { label: '后台 Logo', type: 'image', section: 'Logo', help: '建议 170×50', order: 10 },
    logoSquare: { label: '方形 Logo', type: 'image', section: 'Logo', order: 11 },
    loginLogo: { label: '登录页 Logo', type: 'image', section: 'Logo', order: 12 },
    favicon: { label: '浏览器图标', type: 'image', section: 'Logo', order: 13 },

    icpNumber: { label: 'ICP 备案号', type: 'text', section: '备案', order: 20 },
    icpUrl: { label: 'ICP 备案链接', type: 'text', section: '备案', order: 21 },
    publicSecurityNumber: { label: '公安备案号', type: 'text', section: '备案', order: 22 },
    publicSecurityUrl: { label: '公安备案链接', type: 'text', section: '备案', order: 23 },

    contactQrcode: { label: '客服二维码', type: 'image', section: '二维码', order: 30 },
    shareQrcode: { label: '商城二维码', type: 'image', section: '二维码', order: 31 },

    shareTitle: { label: '分享标题', type: 'text', section: '分享', order: 40 },
    shareSummary: { label: '分享简介', type: 'textarea', section: '分享', order: 41 },
    shareImage: {
      label: '分享图片',
      type: 'image',
      section: '分享',
      help: '比例 5:4，建议小于 50KB',
      order: 42,
    },
  },
  legacyKeys: {
    siteName: 'site_name',
    siteKeywords: 'site_keywords',
    siteDescription: 'site_description',
    contactPhone: ['site_phone', 'contact_number'],
    companyAddress: 'company_address',
    logo: 'site_logo',
    logoSquare: 'site_logo_square',
    loginLogo: ['login_logo', 'wap_login_logo'],
    favicon: 'ico_path',
    icpNumber: 'record_No',
    icpUrl: 'icp_url',
    publicSecurityNumber: 'network_security',
    publicSecurityUrl: 'network_security_url',
    contactQrcode: ['customer_qrcode', 'wechat_qrcode'],
    shareQrcode: 'share_qrcode',
    shareTitle: 'wechat_share_title',
    shareSummary: 'wechat_share_synopsis',
    shareImage: 'wechat_share_img',
  },
});
