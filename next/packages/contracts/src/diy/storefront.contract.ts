import { z } from 'zod';

import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  diyStorefrontPage,
  diyStorefrontPageExample,
  diyStorefrontTheme,
  diyVersion,
} from './schemas';

/**
 * 页面装修 — what the uni-app renderer reads.
 *
 * Public: the decorated home page is the first thing a cold visitor sees, and
 * the legacy `/api/diy/get_diy` was open too. Nothing user-specific is in the
 * payload; the components that need a login fetch their own data.
 *
 * Every response carries `version`, and the handlers also set it as the `ETag`.
 * The app polls the cheap `/version` route on resume and only re-fetches the
 * page when the string changed — the same trick as the legacy
 * `get_diy_version`, which existed because the payload is large and changes
 * rarely.
 */

export const diyHomePage = defineRoute({
  id: 'diy.homePage',
  method: 'GET',
  path: '/api/v1/diy/pages/home',
  auth: 'public',
  summary: '首页装修数据',
  tags: ['diy'],
  response: diyStorefrontPage,
  errors: ['DIY_HOME_PAGE_MISSING'],
  examples: [{ name: 'ok', response: diyStorefrontPageExample }],
});

export const diyPage = defineRoute({
  id: 'diy.page',
  method: 'GET',
  path: '/api/v1/diy/pages/:id',
  auth: 'public',
  summary: '装修页面数据',
  tags: ['diy'],
  params: z.object({ id }),
  response: diyStorefrontPage,
  errors: ['DIY_PAGE_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: diyStorefrontPageExample }],
});

export const diyPageVersion = defineRoute({
  id: 'diy.pageVersion',
  method: 'GET',
  path: '/api/v1/diy/version',
  auth: 'public',
  summary: '装修数据版本号',
  tags: ['diy'],
  query: z.object({ id: id.optional() }),
  response: z.object({ version: diyVersion }),
  errors: ['DIY_HOME_PAGE_MISSING', 'DIY_PAGE_NOT_FOUND'],
  examples: [{ name: 'ok', query: {}, response: { version: '1716451200000' } }],
});

export const diyTheme = defineRoute({
  id: 'diy.theme',
  method: 'GET',
  path: '/api/v1/diy/theme',
  auth: 'public',
  summary: '当前主题',
  tags: ['diy'],
  response: diyStorefrontTheme,
  errors: ['DIY_THEME_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      response: {
        id: '1',
        name: '默认主题',
        tokens: { theme: '#E93323', accent: '#FF7E00' },
        version: '1716451200000',
      },
    },
  ],
});
