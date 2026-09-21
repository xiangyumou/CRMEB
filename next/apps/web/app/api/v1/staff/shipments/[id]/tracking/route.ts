import { staffShipmentTracking } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/shipments/:id/tracking`. A staff member may look at any parcel the shop sent. */
export const GET = handle(staffShipmentTracking, (ctx, { params }) =>
  orderStaff.shipmentTracking(ctx, params),
);

export const dynamic = 'force-dynamic';
