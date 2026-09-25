import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  refundAdminApprove,
  refundAdminDetail,
  refundAdminList,
  refundAdminReject,
} from '@shop/contracts/refund/refund.admin.contract';
import {
  adminRefundDetailExample,
  adminRefundExample,
  type AdminRefundListItem,
} from '@shop/contracts/refund/schemas';

import { resetApiConfig } from '@/admin/api/config';
import { on, stubRoutes, type StubCall } from '@/test/api';
import { renderAdmin, testIdentity } from '@/test/render';

import { RefundRequestsPage } from './refund-requests';

/**
 * 售后单 as a component test: an operator decides from the dialog, so the
 * dialog must carry what is being decided — the amount and the buyer's reason —
 * and the drawer next to it must not keep the status from before the click.
 */

const identity = {
  ...testIdentity,
  permissions: ['refund:request:read', 'refund:request:review', 'refund:request:execute'],
};

function stubApi(row: AdminRefundListItem = adminRefundExample): StubCall[] {
  return stubRoutes([
    on(refundAdminList, { items: [row], total: 1, page: 1, pageSize: 20 }),
    on(refundAdminDetail, { ...adminRefundDetailExample, ...row }),
    on(refundAdminApprove, { ...adminRefundDetailExample, ...row, status: 'approved' }),
    on(refundAdminReject, {
      ...adminRefundDetailExample,
      ...row,
      status: 'rejected',
      rejectReason: '已线下退款',
    }),
  ]);
}

afterEach(() => {
  resetApiConfig();
});

describe('售后单', () => {
  for (const action of ['同意', '拒绝'] as const) {
    it(`repeats the amount and the buyer’s reason in the ${action} dialog`, async () => {
      stubApi();
      renderAdmin(<RefundRequestsPage />, { identity });
      await screen.findByText(adminRefundExample.refundNo);

      await userEvent.click(screen.getByRole('button', { name: action }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('买家原因')).toBeInTheDocument();
      expect(within(dialog).getByText('商品破损')).toBeInTheDocument();
      expect(within(dialog).getByText('申请金额')).toBeInTheDocument();
    });
  }

  it('REFUND-017 — offers 关闭 on a refund WeChat refused, through the reject route', async () => {
    const failed: AdminRefundListItem = {
      ...adminRefundExample,
      kind: 'refund_only',
      returnStage: 'not_required',
      status: 'failed',
      lastError: '余额不足',
    };
    const calls = stubApi(failed);
    renderAdmin(<RefundRequestsPage />, { identity });
    await screen.findByText(failed.refundNo);

    expect(screen.queryByRole('button', { name: '同意' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), '已线下退款');
    await userEvent.click(within(dialog).getByRole('button', { name: '确认关闭' }));

    await waitFor(() => {
      const reject = calls.find((call) => call.method === 'POST');
      expect(reject?.url).toContain(`/admin-api/refunds/${failed.id}/reject`);
      expect(reject?.body).toEqual({ rejectReason: '已线下退款' });
    });
  });

  it('refreshes the open drawer after an approval', async () => {
    const calls = stubApi();
    renderAdmin(<RefundRequestsPage />, { identity });
    await screen.findByText(adminRefundExample.refundNo);

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await user.click(screen.getByRole('button', { name: '详情' }));
    await screen.findByText('收到时箱子被压坏，里面有三个苹果烂了');
    const detailCalls = () =>
      calls.filter(
        (call) =>
          call.method === 'GET' && call.url.includes(`/admin-api/refunds/${adminRefundExample.id}`),
      ).length;
    const before = detailCalls();

    await user.click(screen.getByRole('button', { name: '同意' }));
    const dialogs = await screen.findAllByRole('dialog');
    const approve = dialogs.find((dialog) => within(dialog).queryByText('确认同意') !== null)!;
    await user.click(within(approve).getByRole('button', { name: '确认同意' }));

    await waitFor(() => expect(detailCalls()).toBeGreaterThan(before));
  });
});
