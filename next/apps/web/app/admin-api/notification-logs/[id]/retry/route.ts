import { notificationAdminLogRetry } from '@shop/contracts/notification/notification.admin.contract';
import { notificationAdmin } from '@shop/core/notification';
import { handle } from '../../../../../src/server';

/** Re-queues a parked send. The per-channel claims mean only the unsent channels go out again. */
export const POST = handle(notificationAdminLogRetry, (ctx, { params }) =>
  notificationAdmin.retryLog(ctx, params),
);

export const dynamic = 'force-dynamic';
