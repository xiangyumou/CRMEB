import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { groupbuyGroupDetailExample, groupbuyGroupExample } from '@shop/contracts/groupbuy/schemas';
import {
  groupbuyAdminGroupComplete,
  groupbuyAdminGroupDetail,
  groupbuyAdminGroupList,
} from '@shop/contracts/groupbuy/groupbuy.admin.contract';

import { resetApiConfig } from '@/admin/api/config';
import { on, stubRoutes, type StubCall } from '@/test/api';
import { renderAdmin, testIdentity } from '@/test/render';

import { GroupbuyGroupsPage } from './groupbuy-groups';

/**
 * 拼团列表 as a component test.
 *
 * The one action on this page that invents data is 立即成团, so that is what is
 * asserted hardest: it hangs off its own permission atom, it goes to the
 * `completion` sub-resource, and the operator is never asked to type their own
 * name into it — `handle()` writes the audit row.
 */

function stubApi(): StubCall[] {
  return stubRoutes([
    on(groupbuyAdminGroupDetail, groupbuyGroupDetailExample),
    on(groupbuyAdminGroupList, { items: [groupbuyGroupExample], total: 1, page: 1, pageSize: 20 }),
    on(groupbuyAdminGroupComplete, {
      ...groupbuyGroupDetailExample,
      status: 'succeeded',
      virtuallyFilled: true,
    }),
  ]);
}

afterEach(() => {
  resetApiConfig();
});

const allPermissions = {
  ...testIdentity,
  permissions: ['groupbuy:group:read', 'groupbuy:group:complete'],
};

describe('拼团列表', () => {
  it('shows a team as seats taken out of seats needed', async () => {
    const calls = stubApi();
    renderAdmin(<GroupbuyGroupsPage />, { identity: allPermissions });

    expect(await screen.findByText('三人成团 · 坚果礼盒')).toBeInTheDocument();
    // Seats, not a participant count: an unpaid order holds nothing.
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('拼团中')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/groupbuy-groups?');
  });

  it('keeps 立即成团 behind its own permission atom', async () => {
    stubApi();
    renderAdmin(<GroupbuyGroupsPage />, {
      identity: { ...testIdentity, permissions: ['groupbuy:group:read'] },
    });

    await screen.findByText('三人成团 · 坚果礼盒');
    expect(screen.getByRole('button', { name: '详情' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '立即成团' })).not.toBeInTheDocument();
  });

  it('lists everyone who ever joined, including who left', async () => {
    stubApi();
    renderAdmin(<GroupbuyGroupsPage />, { identity: allPermissions });
    await screen.findByText('三人成团 · 坚果礼盒');

    await userEvent.click(screen.getByRole('button', { name: '详情' }));

    const drawer = await screen.findByRole('dialog');
    expect(await within(drawer).findByText('小红')).toBeInTheDocument();
    // The leader's own row, with the order number the seat was paid for.
    expect(within(drawer).getByText('202609221000000000000001')).toBeInTheDocument();
    expect(within(drawer).getAllByText('团长').length).toBeGreaterThan(0);
  });

  it('completes a team through the completion sub-resource', async () => {
    const calls = stubApi();
    renderAdmin(<GroupbuyGroupsPage />, { identity: allPermissions });
    await screen.findByText('三人成团 · 坚果礼盒');

    await userEvent.click(screen.getByRole('button', { name: '立即成团' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), '客服协助成团');
    await userEvent.click(within(dialog).getByRole('button', { name: '确认成团' }));

    await waitFor(() => {
      const complete = calls.find((call) => call.method === 'POST');
      expect(complete?.url).toContain('/admin-api/groupbuy-groups/501/completion');
      // Only the reason: the operator is `ctx.actor`, not a string in the body.
      expect(complete?.body).toEqual({ reason: '客服协助成团' });
    });
  });
});
