import type { Metadata } from 'next';
import { cache } from 'react';

import { LandingPage } from '@/landing/landing-page';
import { loadLanding } from '@/server/landing';

/**
 * `/` — the landing page: the shop's name, the 小程序码, "open it in WeChat".
 *
 * Until the cutover the edge serves the uni-app H5 at `/`, so this is reached
 * only on the web container directly; docs/mini/cutover.md §2.10 is the edge
 * change that puts it in front.
 */
export const dynamic = 'force-dynamic';

/** Once per request: the metadata and the page read the same settings. */
const load = cache(loadLanding);

export async function generateMetadata(): Promise<Metadata> {
  const { shopName } = await load();
  return {
    title: { absolute: shopName ?? '商城' },
    description: '请使用微信扫码打开小程序',
  };
}

export default async function RootPage() {
  return <LandingPage data={await load()} />;
}
