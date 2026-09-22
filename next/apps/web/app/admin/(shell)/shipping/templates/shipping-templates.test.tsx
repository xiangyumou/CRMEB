import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { ShippingTemplatesPage } from './shipping-templates';

/**
 * 运费模板 as a component test.
 *
 * The wiring worth asserting is that the list comes from the contract route,
 * that 删除 sits on its own `shipping:template:delete` atom (write is not
 * enough — deleting a template silently moves products onto "no template"),
 * and that opening the editor fetches the detail the drawer edits, since the
 * list row carries no rules.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const row = {
  id: '1',
  name: '全国包邮（满 5 件）',
  chargeMode: 'quantity',
  hasFreeRules: true,
  hasNoDeliveryRules: false,
  sortOrder: 10,
  productCount: 4,
  createdAt: '2026-01-01T09:00:00+08:00',
  updatedAt: '2026-06-01T09:00:00+08:00',
};

const detail = {
  ...row,
  regions: [
    {
      isFallback: true,
      cityIds: [],
      firstUnit: 1,
      firstPrice: '10.00',
      additionalUnit: 1,
      additionalPrice: '5.00',
    },
  ],
  freeRules: [{ cityIds: [], minUnits: 5, minAmount: null }],
  noDeliveryCityIds: [],
};

function stubApi(): Call[] {
  const calls: Call[] = [];
  configureApi({
    async fetch(input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? 'GET';
      calls.push({
        method,
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      const payload = url.includes('/admin-api/shipping/cities')
        ? { items: [], version: 'test' }
        : url.includes('/admin-api/shipping/templates/')
          ? detail
          : { items: [row], total: 1, page: 1, pageSize: 20 };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });
  return calls;
}

afterEach(() => {
  resetApiConfig();
});

const writer = {
  ...testIdentity,
  permissions: ['shipping:template:read', 'shipping:template:write'],
};

describe('运费模板', () => {
  it('lists templates from the contract route', async () => {
    const calls = stubApi();
    renderAdmin(<ShippingTemplatesPage />, { identity: writer });

    expect(await screen.findByText('全国包邮（满 5 件）')).toBeInTheDocument();
    expect(screen.getByText('按件数')).toBeInTheDocument();
    expect(screen.getByText('包邮规则')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/shipping/templates?');
    expect(calls[0]?.url).toContain('page=1');
  });

  it('keeps 删除 on its own atom, which write alone does not grant', async () => {
    stubApi();
    renderAdmin(<ShippingTemplatesPage />, { identity: writer });

    await screen.findByText('全国包邮（满 5 件）');
    expect(screen.getByRole('button', { name: '编辑' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('hides the toolbar from a read-only admin', async () => {
    stubApi();
    renderAdmin(<ShippingTemplatesPage />, {
      identity: { ...testIdentity, permissions: ['shipping:template:read'] },
    });

    await screen.findByText('全国包邮（满 5 件）');
    expect(screen.queryByRole('button', { name: /新建模板/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
  });

  it('loads the detail when the drawer opens, because the row carries no rules', async () => {
    const calls = stubApi();
    renderAdmin(<ShippingTemplatesPage />, { identity: writer });
    await screen.findByText('全国包邮（满 5 件）');

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('编辑运费模板')).toBeInTheDocument();
    expect(calls.some((call) => call.url.includes('/admin-api/shipping/templates/1'))).toBe(true);
  });
});
