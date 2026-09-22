import { defineRoute } from '../_conventions/route';
import { sitePublicConfig, sitePublicConfigExample } from './schemas';

/**
 * `GET /api/v1/site/config` — the shop's own public settings (CR-7-h2).
 *
 * F1 built the settings system end to end for the console and nothing read it
 * back out for the app: the storefront showed its own bundled logo, no
 * copyright line, the generic share card, a 客服 button that went nowhere and a
 * blank splash screen. Six legacy endpoints answered that, all of them "what
 * did the operator type into that box", so this is one route and one response;
 * the app fans it out to the six legacy shapes in a mapper.
 *
 * **Public**, because every one of the six was read before login — `App.vue` on
 * launch, `pages/users/login` above the sign-in form, `pages/guide` before
 * anything else. `GET /api/v1/agreements/:key` is the precedent.
 *
 * **Cheap to poll.** The payload is cached for 60 s in Redis and dropped the
 * moment a source group is saved, and `version` (also the `ETag`) lets the app
 * keep it in storage between launches.
 */
export const systemSiteConfigGet = defineRoute({
  id: 'system.siteConfigGet',
  method: 'GET',
  path: '/api/v1/site/config',
  auth: 'public',
  summary: '站点公开配置',
  tags: ['system'],
  response: sitePublicConfig,
  examples: [
    { name: 'ok', response: sitePublicConfigExample },
    {
      name: 'nothing-filled-in',
      // A fresh install answers this, and every field of it is renderable:
      // the app must never have to guess whether an empty shop is an error.
      response: {
        name: 'CRMEB 商城',
        logo: { main: null, login: null, square: null, favicon: null },
        copyright: { text: '', link: null, imageUrl: null },
        share: { title: '', synopsis: '', image: null },
        filing: {
          icpNumber: '',
          icpUrl: 'https://beian.miit.gov.cn/',
          publicSecurityNumber: '',
          publicSecurityUrl: '',
        },
        payments: { wechat: false },
        support: { kind: 'none', phone: null, qrcodeUrl: null },
        splashAd: { enabled: false, imageUrl: null, link: null, seconds: 3 },
        version: '0',
      },
    },
  ],
});
