import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  catalogAdminReviewBatchSetStatus,
  catalogAdminReviewList,
  catalogAdminReviewReply,
  catalogAdminReviewReplyUpdate,
  catalogAdminReviewSetStatus,
} from '@shop/contracts/catalog/catalog.review.contract';
import type { AdminProductReview } from '@shop/contracts/catalog/schemas';

import { resetApiConfig } from '@/admin/api/config';
import { on, stubRoutes, type StubCall } from '@/test/api';
import { renderAdmin, testIdentity, zhName } from '@/test/render';

import { ProductReviewsPage } from './product-reviews';

const row: AdminProductReview = {
  id: '5001',
  productId: '1',
  productName: '简约白 T 恤',
  productImageUrl: 'https://cdn.example.com/t.png',
  skuId: '1100',
  specText: '白|XL',
  userId: '9',
  orderId: '88',
  orderItemId: '200',
  authorNickname: '小明',
  authorAvatarUrl: null,
  productScore: 5,
  serviceScore: 5,
  content: '面料很舒服',
  images: [],
  status: 'pending',
  replyContent: null,
  replyAt: null,
  createdAt: '2026-06-01T10:00:00+08:00',
};

function stubApi(): StubCall[] {
  return stubRoutes([
    on(catalogAdminReviewBatchSetStatus, { updated: 1 }),
    on(catalogAdminReviewList, { items: [row], total: 1, page: 1, pageSize: 20 }),
    on(catalogAdminReviewSetStatus, { ...row, status: 'published' }),
    on(catalogAdminReviewReply, { ...row, status: 'published' }),
    on(catalogAdminReviewReplyUpdate, { ...row, status: 'published' }),
  ]);
}

afterEach(() => {
  resetApiConfig();
});

const moderator = {
  ...testIdentity,
  permissions: ['catalog:review:read', 'catalog:review:write', 'catalog:review:delete'],
};

describe('商品评价', () => {
  it('lists reviews from the contract route', async () => {
    const calls = stubApi();
    renderAdmin(<ProductReviewsPage />, { identity: moderator });

    expect(await screen.findByText('面料很舒服')).toBeInTheDocument();
    expect(screen.getByText('待审核')).toBeInTheDocument();
    expect(calls[0]?.url).toContain('/admin-api/catalog/reviews?');
  });

  it('hides moderation from an admin who may only read', async () => {
    stubApi();
    renderAdmin(<ProductReviewsPage />, {
      identity: { ...testIdentity, permissions: ['catalog:review:read'] },
    });

    await screen.findByText('面料很舒服');
    expect(screen.queryByRole('button', { name: zhName('回复') })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: zhName('显示') })).not.toBeInTheDocument();
    // Deleting is its own atom again: it recomputes the product's score.
    expect(screen.queryByRole('button', { name: zhName('删除') })).not.toBeInTheDocument();
  });

  it('publishes one review through its status sub-resource', async () => {
    const calls = stubApi();
    renderAdmin(<ProductReviewsPage />, { identity: moderator });
    await screen.findByText('面料很舒服');

    await userEvent.click(screen.getByRole('button', { name: zhName('显示') }));

    await waitFor(() => {
      const toggle = calls.find((call) => call.url.includes('/reviews/5001/status'));
      expect(toggle?.body).toEqual({ status: 'published' });
    });
  });

  it('publishes a selection in one request', async () => {
    const calls = stubApi();
    renderAdmin(<ProductReviewsPage />, { identity: moderator });
    await screen.findByText('面料很舒服');

    // The row checkbox; the first one in the table is the select-all header.
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[boxes.length - 1] as HTMLElement);
    await userEvent.click(await screen.findByRole('button', { name: zhName('批量显示') }));

    await waitFor(() => {
      const batch = calls.find((call) => call.url.endsWith('/reviews/statuses'));
      // Ids stay decimal strings, and one request moves the lot.
      expect(batch?.body).toEqual({ reviewIds: ['5001'], status: 'published' });
    });
  });

  it('replies through the create route while the review has no reply', async () => {
    const calls = stubApi();
    renderAdmin(<ProductReviewsPage />, { identity: moderator });
    await screen.findByText('面料很舒服');

    await userEvent.click(screen.getByRole('button', { name: zhName('回复') }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByRole('textbox'), '感谢支持！');
    await userEvent.click(within(dialog).getByRole('button', { name: zhName('提交') }));

    await waitFor(() => {
      const reply = calls.find((call) => call.url.includes('/reviews/5001/reply'));
      // First reply notifies the buyer, an edit does not — so create and
      // update are separate routes, picked by whether a reply exists.
      expect(reply?.method).toBe('POST');
      expect(reply?.body).toEqual({ content: '感谢支持！' });
    });
  });
});
