import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { configureApi, resetApiConfig } from '@/admin/api/config';
import { renderAdmin, testIdentity } from '@/test/render';

import { CouponTemplatesPage } from './coupon-templates';

/**
 * The admin page as a component test: no browser, no server, one stub `fetch`.
 *
 * What is worth asserting on a kit-built page is the *wiring* — that the table
 * asks the right route, that permissions really hide the buttons, and that an
 * action sends the body the contract declares. The kit's own tests already
 * cover paging, sorting and form rendering, so this does not repeat them.
 */

interface Call {
  method: string;
  url: string;
  body: unknown;
}

const row = {
  id: '7',
  name: '满 100 减 10',
  scope: 'all_products',
  claimMode: 'manual',
  status: 'active',
  discountAmount: '10.00',
  minSpend: '100.00',
  validityMode: 'days_after_claim',
  validFrom: null,
  validTo: null,
  validDays: 30,
  claimFrom: null,
  claimTo: null,
  isUnlimitedSupply: false,
  totalCount: 100,
  remainingCount: 97,
  issuedCount: 3,
  perUserLimit: 1,
  giftMinOrderAmount: null,
  sortOrder: 0,
  createdAt: '2026-06-01T10:00:00+08:00',
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
      const payload = url.includes('/grants')
        ? { granted: 3, skippedUserIds: [] }
        : method === 'GET'
          ? { items: [row], total: 1, page: 1, pageSize: 20 }
          : { ...row, status: 'disabled' };
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
  permissions: [
    'coupon:template:read',
    'coupon:template:write',
    'coupon:template:delete',
    'coupon:grant:write',
  ],
};

describe('优惠券列表', () => {
  it('lists campaigns from the contract route', async () => {
    const calls = stubApi();
    renderAdmin(<CouponTemplatesPage />, { identity: allPermissions });

    expect(await screen.findByText('满 100 减 10')).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    // Supply is shown as "what is left / what has gone out".
    expect(screen.getByText(/剩 97/)).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/coupons?');
    expect(calls[0]?.url).toContain('page=1');
  });

  it('hides every write action from a read-only admin', async () => {
    stubApi();
    renderAdmin(<CouponTemplatesPage />, {
      identity: { ...testIdentity, permissions: ['coupon:template:read'] },
    });

    await screen.findByText('满 100 减 10');
    expect(screen.queryByRole('button', { name: '新建优惠券' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '发放' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument();
  });

  it('toggles the status through the sub-resource, not the edit form', async () => {
    const calls = stubApi();
    renderAdmin(<CouponTemplatesPage />, { identity: allPermissions });
    await screen.findByText('满 100 减 10');

    await userEvent.click(screen.getByRole('button', { name: '停用' }));

    await waitFor(() => {
      const toggle = calls.find((call) => call.method === 'POST');
      expect(toggle?.url).toContain('/admin-api/coupons/7/status');
      expect(toggle?.body).toEqual({ status: 'disabled' });
    });
  });

  it('grants to a pasted list of user ids', async () => {
    const calls = stubApi();
    renderAdmin(<CouponTemplatesPage />, { identity: allPermissions });
    await screen.findByText('满 100 减 10');

    await userEvent.click(screen.getByRole('button', { name: '发放' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), '1001, 1002\n1003');
    await userEvent.click(within(dialog).getByRole('button', { name: '发 放' }));

    await waitFor(() => {
      const grant = calls.find((call) => call.url.includes('/grants'));
      expect(grant?.method).toBe('POST');
      // Whitespace, commas and newlines all separate; ids stay strings.
      expect(grant?.body).toEqual({ userIds: ['1001', '1002', '1003'] });
    });
  });
});
