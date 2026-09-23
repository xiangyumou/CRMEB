import { systemSiteConfigGet } from '@shop/contracts/system/system.site.contract';
import * as system from '@shop/core/system';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/site/config` — 站点公开配置.
 *
 * Public, like the agreements read: every read of it happens before there is
 * a session — on launch, above the sign-in
 * form and on the splash screen.
 */
export const GET = handle(systemSiteConfigGet, (ctx) => system.siteConfigGet(ctx));

export const dynamic = 'force-dynamic';
