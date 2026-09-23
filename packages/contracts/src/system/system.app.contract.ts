import { defineRoute } from '../_conventions/route';
import { appAppearanceDefaults, appPublicConfig, appPublicConfigExample } from './app.schemas';

/**
 * `GET /api/v1/app/config` — the mini-program's launch payload.
 *
 * **Public**: the app reads it before anybody signs in, to paint the theme and
 * the tab bar, decide which sign-in buttons to show and whether a splash comes
 * first.
 *
 * **Cheap to poll**, exactly like `GET /api/v1/site/config`: cached 60 s in
 * Redis, dropped the moment a source group is saved, and `version` is the weak
 * `ETag`, so a launch that already holds the current payload gets a bodyless
 * 304 for `If-None-Match`.
 *
 * `site/config` is left as it is for the legacy uni-app; the two share their
 * builders, so the values they both carry always agree.
 */
export const systemAppConfigGet = defineRoute({
  id: 'system.appConfigGet',
  method: 'GET',
  path: '/api/v1/app/config',
  auth: 'public',
  summary: '小程序启动配置',
  tags: ['system'],
  response: appPublicConfig,
  examples: [
    { name: 'ok', response: appPublicConfigExample },
    {
      name: 'nothing-filled-in',
      // A fresh install: every field renderable, the appearance at its defaults.
      response: {
        name: 'CRMEB 商城',
        logo: { main: null, login: null, square: null, favicon: null },
        share: { title: '', synopsis: '', image: null },
        support: { kind: 'none', phone: null, qrcodeUrl: null },
        auth: { wechatOa: false, wechatMini: false, phone: false, wechatRequiresPhone: true },
        payments: { wechat: false },
        splashAd: { enabled: false, imageUrl: null, link: null, seconds: 3 },
        subscribeTemplates: { orderCreate: [], orderPay: [], orderShip: [], refund: [] },
        appearance: appAppearanceDefaults,
        version: '0',
      },
    },
  ],
});
