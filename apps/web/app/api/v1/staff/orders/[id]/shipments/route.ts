import { staffShip, staffShipments } from '@shop/contracts/order/order.staff.contract';
import { orderStaff } from '@shop/core/order';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/orders/:id/shipments` — the phone ships through the same service the web does. */
export const GET = handle(staffShipments, (ctx, { params }) => orderStaff.shipments(ctx, params));

export const POST = handle(staffShip, async (ctx, { params, body }) => {
  const shipment = await orderStaff.ship(ctx, params, body);
  ctx.audit(`order:${params.id}`);
  return shipment;
});

export const dynamic = 'force-dynamic';
