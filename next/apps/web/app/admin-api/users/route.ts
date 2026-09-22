import { userAdminList } from '@shop/contracts/user/user.admin.contract';
import * as user from '@shop/core/user';
import { handle } from '../../../src/server';

/** `GET /admin-api/users` — the 客户列表 with its filters. */
export const GET = handle(userAdminList, (ctx, { query }) => user.adminList(ctx, query));

export const dynamic = 'force-dynamic';
