import { staffUserLabelList, staffUserSetLabels } from '@shop/contracts/user/user.staff.contract';
import { staffLabelList, staffSetLabels } from '@shop/core/user';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/users/:uid/labels` — the catalogue with this customer's labels flagged. */
export const GET = handle(staffUserLabelList, (ctx, { params }) => staffLabelList(ctx, params));

/** The same path, replacing the set: the drawer submits its whole selection. */
export const POST = handle(staffUserSetLabels, async (ctx, { params, body }) => {
  const updated = await staffSetLabels(ctx, params, body);
  ctx.audit(`user:${params.uid}`);
  return updated;
});

export const dynamic = 'force-dynamic';
