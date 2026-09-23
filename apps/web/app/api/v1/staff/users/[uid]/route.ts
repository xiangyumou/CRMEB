import { staffUserDetailRoute } from '@shop/contracts/user/user.staff.contract';
import { staffDetail } from '@shop/core/user';
import { handle } from '../../../../../../src/server';

/** `/api/v1/staff/users/:uid` — one row of the list, reached from a uid alone. */
export const GET = handle(staffUserDetailRoute, (ctx, { params }) => staffDetail(ctx, params));

export const dynamic = 'force-dynamic';
