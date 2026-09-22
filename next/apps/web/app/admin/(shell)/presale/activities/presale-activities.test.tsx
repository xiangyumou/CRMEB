import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { PresaleActivitiesPage } from './presale-activities';

/**
 * The admin page as a component test: no browser, no server, one stub `fetch`.
 *
 * What is worth asserting on a kit-built page is the *wiring* — that the table
 * asks the right route, that permissions really hide the buttons, and that an
 * action sends the body the contract declares. The kit's own tests already
 * cover paging, sorting and form rendering, so this does not repeat them.
 *
 * The one that matters most is the last: the edit dialog must load the detail
 * before it renders, because `presaleAdminActivityUpdate` takes a whole
 * activity and a form opened on a list row would submit an empty 规格 list and
 * silently delete every presale price on the campaign.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const row = {
  id: '7',
  productId: '12',
  productName: '明前龙井',
  title: '春茶预售 · 明前龙井',
  intro: '付款后 15 天内发货',
  imageUrl: 'https://example.test/p.png',
  status: 'active',
  paymentMode: 'full',
  price: '59.00',
  originalPrice: '88.00',
  stock: 480,
  sales: 20,
  totalQuota: 500,
  perOrderQuantity: 2,
  startAt: '2026-05-01T08:00:00+08:00',
  endAt: '2026-07-01T08:00:00+08:00',
  shipAfterDays: 15,
  sortOrder: 0,
  createdAt: '2026-05-01T08:00:00+08:00',
};

const detail = {
  ...row,
  sliderImages: [],
  shippingTemplateId: null,
  skus: [
    {
      skuId: '33',
      specText: '一级|250g',
      price: '59.00',
      stock: 480,
      sales: 20,
      quota: null,
      isEnabled: true,
    },
  ],
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
      // The list route carries a query string; the detail route does not.
      const payload =
        method === 'GET'
          ? url.includes('?')
            ? { items: [row], total: 1, page: 1, pageSize: 20 }
            : detail
          : { ...detail, status: 'paused' };
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

const allPermissions = {
  ...testIdentity,
  permissions: ['presale:activity:read', 'presale:activity:write', 'presale:activity:delete'],
};

describe('预售活动', () => {
  it('lists campaigns from the contract route', async () => {
    const calls = stubApi();
    renderAdmin(<PresaleActivitiesPage />, { identity: allPermissions });

    expect(await screen.findByText('春茶预售 · 明前龙井')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(screen.getByText('全款预售')).toBeInTheDocument();
    // Supply reads as "what is left / what has gone out / the cap".
    expect(screen.getByText(/剩 480/)).toBeInTheDocument();
    // The 发货承诺 is a sentence, not a bare integer an operator has to decode.
    expect(screen.getByText('付款后 15 天内')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/presale-activities?');
    expect(calls[0]?.url).toContain('page=1');
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<PresaleActivitiesPage />, {
      identity: { ...testIdentity, permissions: ['presale:activity:read'] },
    });

    await screen.findByText('春茶预售 · 明前龙井');
    expect(screen.queryByRole('button', { name: '新建预售活动' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '暂停' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('pauses through the sub-resource, not the edit form', async () => {
    const calls = stubApi();
    renderAdmin(<PresaleActivitiesPage />, { identity: allPermissions });
    await screen.findByText('春茶预售 · 明前龙井');

    await userEvent.click(screen.getByRole('button', { name: '暂停' }));

    await waitFor(() => {
      const toggle = calls.find((call) => call.method === 'POST');
      expect(toggle?.url).toContain('/admin-api/presale-activities/7/status');
      expect(toggle?.body).toEqual({ status: 'paused' });
    });
  });

  it('loads the detail before the edit form opens, so saving cannot drop the 规格', async () => {
    const calls = stubApi();
    renderAdmin(<PresaleActivitiesPage />, { identity: allPermissions });
    await screen.findByText('春茶预售 · 明前龙井');

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));

    // The detail route is asked for before anything is editable.
    await waitFor(() => {
      expect(calls.some((call) => call.url.endsWith('/admin-api/presale-activities/7'))).toBe(true);
    });

    const dialog = await screen.findByRole('dialog');
    // And the 规格 the detail carried is in the form, not an empty list.
    await waitFor(() => {
      expect(within(dialog).getByDisplayValue('33')).toBeInTheDocument();
    });
  });

  it('opens an empty form for a new campaign without asking for a detail', async () => {
    const calls = stubApi();
    renderAdmin(<PresaleActivitiesPage />, { identity: allPermissions });
    await screen.findByText('春茶预售 · 明前龙井');

    await userEvent.click(screen.getByRole('button', { name: '新建预售活动' }));
    await screen.findByRole('dialog');

    expect(calls.some((call) => call.url.endsWith('/admin-api/presale-activities/7'))).toBe(false);
  });
});
