import { staffUserSetGroup } from '@shop/contracts/user/user.staff.contract';
import { staffSetGroup } from '@shop/core/user';
import { handle } from '../../../../../../../src/server';

/** `/api/v1/staff/users/:uid/group` — replace the customer's group with this one, or none. */
export const POST = handle(staffUserSetGroup, async (ctx, { params, body }) => {
  const updated = await staffSetGroup(ctx, params, body);
  ctx.audit(`user:${params.uid}`);
  return updated;
});

export const dynamic = 'force-dynamic';
