import { z } from 'zod';
import { sitePublicConfig, sitePublicConfigExample } from './schemas';

/**
 * `GET /api/v1/app/config` — everything the mini-program needs before its
 * first screen, in one payload.
 *
 * It is a sibling of `GET /api/v1/site/config`, not a replacement: the legacy
 * uni-app reads that one and keeps reading it unchanged. This one is shaped
 * for the new client — no H5 footer (`filing`, `copyright`), plus the three
 * things that client would otherwise fetch on launch one by one: the
 * subscribe-message template ids, the theme, and the tab bar.
 *
 * Every value is a non-secret config field or a boolean derived from one; the
 * same "cannot leak any secret in any registered group" property that holds
 * for `site/config` is asserted for this payload too (SYS-014).
 */

/**
 * `#RRGGBB`, the one colour form every consumer accepts.
 *
 * There is no colour field kind in the config registry, so a colour is a text
 * field validated by this. Six digits only: the mini-program's native
 * `tabBar.color` and `wx.setTabBarStyle` take `#RRGGBB` and nothing else, and
 * a theme token the tab bar cannot use would be a second rule to remember.
 */
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, '颜色格式应为 #RRGGBB');
export type HexColor = z.infer<typeof hexColor>;

/**
 * Corner-radius scale. A choice rather than a pixel value: the client owns the
 * actual steps (buttons, cards and the price tag each round differently), the
 * shop only picks how round the whole app feels.
 */
export const radiusScale = z.enum(['none', 'small', 'medium', 'large']);
export type RadiusScale = z.infer<typeof radiusScale>;

/** The four fixed tabs, in the order they appear. */
export const appTabKey = z.enum(['home', 'category', 'cart', 'me']);
export type AppTabKey = z.infer<typeof appTabKey>;

export const appTabBarItem = z.object({
  key: appTabKey,
  /** Never empty: a blank label on the settings screen falls back to the default. */
  label: z.string().min(1),
  /** An uploaded icon, or `null` for the client's bundled one. */
  iconUrl: z.string().nullable(),
  selectedIconUrl: z.string().nullable(),
});
export type AppTabBarItem = z.infer<typeof appTabBarItem>;

export const appAppearance = z.object({
  theme: z.object({
    primaryColor: hexColor,
    /** Text and icons drawn on top of `primaryColor` (buttons, badges). */
    primaryContrastColor: hexColor,
    priceColor: hexColor,
    radius: radiusScale,
  }),
  tabBar: z.object({
    color: hexColor,
    selectedColor: hexColor,
    backgroundColor: hexColor,
    /** Always exactly the four fixed tabs, in `appTabKey` order. */
    items: z.array(appTabBarItem).length(4),
  }),
});
export type AppAppearance = z.infer<typeof appAppearance>;

/** Template ids, deduplicated, in the operator's order; `[]` when none are set. */
const templateIds = z.array(z.string());

export const appPublicConfig = z.object({
  name: sitePublicConfig.shape.name,
  logo: sitePublicConfig.shape.logo,
  share: sitePublicConfig.shape.share,
  support: sitePublicConfig.shape.support,
  /**
   * Which sign-in methods to offer — the same probes as `site/config`'s
   * `auth` — plus `wechatRequiresPhone`: whether a first WeChat sign-in will
   * answer `phone-required` (商城登录 → 微信登录强制绑定手机号). The client
   * still branches on the sign-in response; this only lets it say so up front.
   */
  auth: sitePublicConfig.shape.auth.extend({ wechatRequiresPhone: z.boolean() }),
  payments: sitePublicConfig.shape.payments,
  splashAd: sitePublicConfig.shape.splashAd,
  /**
   * Subscribe-message template ids per scene, for `wx.requestSubscribeMessage`
   * — the same values `GET /api/v1/wechat/subscribe-templates?scene=` answers,
   * all four at once. Keys are the scenes in camelCase: `order-create` →
   * `orderCreate`.
   */
  subscribeTemplates: z.object({
    orderCreate: templateIds,
    orderPay: templateIds,
    orderShip: templateIds,
    refund: templateIds,
  }),
  appearance: appAppearance,
  /** Moves whenever any source group is saved; also the weak `ETag`. */
  version: z.string(),
});
export type AppPublicConfig = z.infer<typeof appPublicConfig>;

/** What a fresh install answers: the appearance defaults, nothing configured. */
export const appAppearanceDefaults: AppAppearance = {
  theme: {
    primaryColor: '#E93323',
    primaryContrastColor: '#FFFFFF',
    priceColor: '#E93323',
    radius: 'medium',
  },
  tabBar: {
    color: '#282828',
    selectedColor: '#E93323',
    backgroundColor: '#FFFFFF',
    items: [
      { key: 'home', label: '首页', iconUrl: null, selectedIconUrl: null },
      { key: 'category', label: '分类', iconUrl: null, selectedIconUrl: null },
      { key: 'cart', label: '购物车', iconUrl: null, selectedIconUrl: null },
      { key: 'me', label: '我的', iconUrl: null, selectedIconUrl: null },
    ],
  },
};

export const appPublicConfigExample: AppPublicConfig = {
  name: sitePublicConfigExample.name,
  logo: sitePublicConfigExample.logo,
  share: sitePublicConfigExample.share,
  support: { kind: 'mini-program', phone: '400-000-0000', qrcodeUrl: null },
  auth: { wechatOa: false, wechatMini: true, phone: true, wechatRequiresPhone: true },
  payments: { wechat: true },
  splashAd: sitePublicConfigExample.splashAd,
  subscribeTemplates: {
    orderCreate: [],
    orderPay: ['kL9x2fP0bQ-order-paid-3a7c'],
    orderShip: ['kL9x2fP0bQ-shipped-51de', 'kL9x2fP0bQ-delivered-9b02'],
    refund: ['kL9x2fP0bQ-refund-e4f1'],
  },
  appearance: {
    theme: {
      primaryColor: '#1677FF',
      primaryContrastColor: '#FFFFFF',
      priceColor: '#FF4D4F',
      radius: 'large',
    },
    tabBar: {
      color: '#666666',
      selectedColor: '#1677FF',
      backgroundColor: '#FFFFFF',
      items: [
        {
          key: 'home',
          label: '首页',
          iconUrl: '/uploads/attach/2026/09/tab-home.png',
          selectedIconUrl: '/uploads/attach/2026/09/tab-home-on.png',
        },
        { key: 'category', label: '分类', iconUrl: null, selectedIconUrl: null },
        { key: 'cart', label: '购物车', iconUrl: null, selectedIconUrl: null },
        { key: 'me', label: '我的', iconUrl: null, selectedIconUrl: null },
      ],
    },
  },
  version: '1758500000000',
};
