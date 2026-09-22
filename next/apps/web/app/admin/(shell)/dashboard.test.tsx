import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { dashboardHeaderExample } from '@shop/contracts/system/schemas';
import {
  orderStatsExample,
  productRankingExample,
  tradeStatsExample,
} from '@shop/contracts/stats/schemas';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { DashboardPage } from './dashboard';

/**
 * 工作台.
 *
 * The thing worth asserting about the home page is that it *contributes*
 * nothing: the tiles come from `/admin-api/dashboard/header`, which is already
 * permission-filtered server-side, and each block below only asks for the
 * route its atom opens. A home page that computed its own figures is how the
 * legacy admin ended up showing three different numbers for one day.
 */

interface Call {
  url: string;
}

function stubApi(header: unknown = dashboardHeaderExample): Call[] {
  const calls: Call[] = [];
  configureApi({
    async fetch(input) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url });
      const payload = url.includes('/dashboard/header')
        ? header
        : url.includes('/stats/products/ranking')
          ? productRankingExample
          : url.includes('/stats/trade')
            ? tradeStatsExample
            : orderStatsExample;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return calls;
}

const identityWith = (permissions: string[]) => ({ ...testIdentity, permissions });

const ALL = ['system:dashboard:read', 'stats:trade:read', 'stats:order:read', 'stats:product:read'];

afterEach(() => {
  resetApiConfig();
});

describe('工作台', () => {
  it('renders the contributed tiles rather than figures of its own', async () => {
    const calls = stubApi();
    renderAdmin(<DashboardPage />, { identity: identityWith(ALL) });

    expect(await screen.findByText('管理员')).toBeInTheDocument();
    expect(screen.getByText('素材数量')).toBeInTheDocument();
    // 1280 attachments, grouped — and the tile's own href, not a page constant.
    expect(screen.getByText('1,280')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /素材数量/ })).toHaveAttribute(
      'href',
      '/admin/storage/attachments',
    );
    expect(calls.some((call) => call.url.includes('/admin-api/dashboard/header'))).toBe(true);
  });

  it('asks only for the blocks the admin may see', async () => {
    const calls = stubApi();
    renderAdmin(<DashboardPage />, {
      identity: identityWith(['system:dashboard:read', 'stats:trade:read']),
    });

    await screen.findByText('管理员');
    await waitFor(() => expect(calls.some((call) => call.url.includes('/stats/trade'))).toBe(true));
    expect(calls.some((call) => call.url.includes('/stats/orders'))).toBe(false);
    expect(calls.some((call) => call.url.includes('/stats/products/ranking'))).toBe(false);
  });

  it('shows what is missing instead of going down when a contributor fails', async () => {
    stubApi({ ...dashboardHeaderExample, degraded: ['storage'] });
    renderAdmin(<DashboardPage />, { identity: identityWith(ALL) });

    expect(await screen.findByText('部分指标暂时不可用')).toBeInTheDocument();
    // The tiles that did come back are still on the page.
    expect(screen.getByText('管理员')).toBeInTheDocument();
  });
});
