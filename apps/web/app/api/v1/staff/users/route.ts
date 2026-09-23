import { staffUserList } from '@shop/contracts/user/user.staff.contract';
import { staffList } from '@shop/core/user';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/users` — 商家管理's customer list. Every phone masked. */
export const GET = handle(staffUserList, (ctx, { query }) => staffList(ctx, query));

export const dynamic = 'force-dynamic';
