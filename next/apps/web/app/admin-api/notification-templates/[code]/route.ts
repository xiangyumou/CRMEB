import {
  notificationAdminTemplateDetail,
  notificationAdminTemplateUpdate,
} from '@shop/contracts/notification/notification.admin.contract';
import { notificationAdmin } from '@shop/core/notification';
import { handle } from '../../../../src/server';

export const GET = handle(notificationAdminTemplateDetail, (ctx, { params }) =>
  notificationAdmin.getTemplate(ctx, params),
);

export const PUT = handle(notificationAdminTemplateUpdate, (ctx, { params, body }) =>
  notificationAdmin.saveTemplate(ctx, params, body),
);

export const dynamic = 'force-dynamic';
