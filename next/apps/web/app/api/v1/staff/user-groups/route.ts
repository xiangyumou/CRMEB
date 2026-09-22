import { staffUserGroupList } from '@shop/contracts/user/user.staff.contract';
import { staffGroupList } from '@shop/core/user';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/user-groups` — the 分组 picker's options, unpaginated. */
export const GET = handle(staffUserGroupList, (ctx) => staffGroupList(ctx));

export const dynamic = 'force-dynamic';
