import { notificationAdminTemplateToggleChannel } from '@shop/contracts/notification/notification.admin.contract';
import { notificationAdmin } from '@shop/core/notification';
import { handle } from '../../../../../../src/server';

/** Switching a channel on validates it: an enabled channel with nothing to send is refused here. */
export const POST = handle(notificationAdminTemplateToggleChannel, (ctx, { params, body }) =>
  notificationAdmin.toggleChannel(ctx, params, body),
);

export const dynamic = 'force-dynamic';
