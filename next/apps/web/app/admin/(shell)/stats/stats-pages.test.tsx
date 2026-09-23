import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  orderStatsExample,
  productRankingExample,
  productStatsExample,
  statsExportExample,
  tradeStatsExample,
  userRegionStatsExample,
  userStatsExample,
} from '@shop/contracts/stats/schemas';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { OrderStatsPage } from './orders/order-stats';
import { ProductStatsPage } from './products/product-stats';
import { TradeStatsPage } from './trade/trade-stats';
import { UserStatsPage } from './users/user-stats';

/**
 * The four statistics pages as component tests: no browser, no server, one
 * stub `fetch` answering with the *contract's own examples*.
 *
 * Using the examples rather than hand-written payloads is the point. They are
 * the same objects `pnpm --filter @shop/contracts check:examples` parses
 * against the response schemas, so a page that renders them is a page that
 * renders what the server is allowed to send — and a contract change that
 * breaks the page breaks this file.
 *
 * What is asserted is wiring: the right route with the range in the query, the
 * labels and figures coming from the server rather than from the page, the
 * export atom really hiding the button, and the export assembling a download
 * from the CSV-in-JSON envelope. The chart itself is not asserted —
 * recharts measures its container, and a zero-width container in happy-dom
 * renders nothing; `StatsChart`'s reshaping is covered where it is pure.
 */

interface Call {
  method: string;
  url: string;
}

function stubApi(): Call[] {
  const calls: Call[] = [];
  configureApi({
    async fetch(input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ method: init?.method ?? 'GET', url });
      return new Response(JSON.stringify(payloadFor(url)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return calls;
}

function payloadFor(url: string): unknown {
  if (url.includes('/stats/users/regions')) return userRegionStatsExample;
  if (url.includes('/stats/users')) return userStatsExample;
  if (url.includes('/stats/products/exports')) return statsExportExample;
  if (url.includes('/stats/products/ranking')) return productRankingExample;
  if (url.includes('/stats/products')) return productStatsExample;
  if (url.includes('/stats/trade/exports')) return statsExportExample;
  if (url.includes('/stats/trade')) return tradeStatsExample;
  if (url.includes('/stats/orders')) return orderStatsExample;
  throw new Error(`no stub for ${url}`);
}

const identityWith = (permissions: string[]) => ({ ...testIdentity, permissions });

afterEach(() => {
  resetApiConfig();
});

// ---------------------------------------------------------------------------

describe('交易统计', () => {
  it('reads the trade route and shows the server’s own labels', async () => {
    const calls = stubApi();
    renderAdmin(<TradeStatsPage />, {
      identity: identityWith(['stats:trade:read', 'stats:trade:export']),
    });

    expect(await screen.findByText('营业额')).toBeInTheDocument();
    expect(screen.getByText('¥80,490.40')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/stats/trade');
  });

  it('hides 导出 from an admin without the export atom', async () => {
    stubApi();
    renderAdmin(<TradeStatsPage />, { identity: identityWith(['stats:trade:read']) });

    await screen.findByText('营业额');
    expect(screen.queryByRole('button', { name: /导出/ })).not.toBeInTheDocument();
  });

  it('turns the CSV envelope into a download', async () => {
    const createObjectURL = vi.fn(() => 'blob:stub');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    // happy-dom treats an anchor click as a navigation and reaches for the
    // real `URL` constructor, which the stub above has replaced.
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const calls = stubApi();

    renderAdmin(<TradeStatsPage />, {
      identity: identityWith(['stats:trade:read', 'stats:trade:export']),
    });
    await screen.findByText('营业额');
    await userEvent.click(screen.getByRole('button', { name: /导出/ }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/stats/trade/exports'))).toBe(true);
      expect(createObjectURL).toHaveBeenCalled();
    });
    expect(click).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('订单统计', () => {
  it('renders the 来源 breakdown the server sent, with its shares', async () => {
    stubApi();
    renderAdmin(<OrderStatsPage />, { identity: identityWith(['stats:order:read']) });

    expect(await screen.findByText('订单量')).toBeInTheDocument();
    expect(screen.getByText('订单来源')).toBeInTheDocument();
    expect(screen.getByText('小程序')).toBeInTheDocument();
  });
});

describe('用户统计', () => {
  it('asks for the regions separately, with the sort and limit it offers', async () => {
    const calls = stubApi();
    renderAdmin(<UserStatsPage />, { identity: identityWith(['stats:user:read']) });

    expect(await screen.findByText('新增用户')).toBeInTheDocument();
    await waitFor(() => {
      const regions = calls.find((call) => call.url.includes('/stats/users/regions'));
      expect(regions?.url).toContain('sortBy=totalUsers');
      expect(regions?.url).toContain('limit=10');
    });
    expect(await screen.findByText('广东')).toBeInTheDocument();
  });
});

describe('商品统计', () => {
  it('shows the ranking under the page, sorted in SQL', async () => {
    const calls = stubApi();
    renderAdmin(<ProductStatsPage />, {
      identity: identityWith(['stats:product:read', 'stats:product:export']),
    });

    expect(await screen.findByText('云南小粒咖啡豆 500g')).toBeInTheDocument();
    const ranking = calls.find((call) => call.url.includes('/stats/products/ranking'));
    expect(ranking?.url).toContain('sortBy=paidAmount');
  });
});
