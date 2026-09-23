import { systemSiteConfigGet } from '@shop/contracts/system/system.site.contract';
import * as system from '@shop/core/system';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/site/config` — 站点公开配置.
 *
 * Public: every read of it happens before there is a session — on launch,
 * above the sign-in form and on the splash screen.
 *
 * A caller holding the current version gets a bodyless 304. The version is the
 * newest save across every config group the payload is built from (the payment
 * and sign-in probes' groups included), so any save that can change the answer
 * moves it. Weak, like the DIY reads: the JSON is rebuilt per request.
 */
export const GET = handle(systemSiteConfigGet, async (ctx) => {
  const config = await system.siteConfigGet(ctx);
  if (ctx.etag(config.version, { weak: true })) ctx.notModified();
  return config;
});

export const dynamic = 'force-dynamic';
