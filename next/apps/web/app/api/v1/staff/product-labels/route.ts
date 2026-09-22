import { catalogStaffProductLabels } from '@shop/contracts/catalog/catalog.staff.contract';
import * as catalog from '@shop/core/catalog';
import { handle } from '../../../../../src/server';

/** `/api/v1/staff/product-labels` — the 标签 drawer, enabled labels grouped by category. */
export const GET = handle(catalogStaffProductLabels, (ctx) => catalog.staffProductLabels(ctx));

export const dynamic = 'force-dynamic';
