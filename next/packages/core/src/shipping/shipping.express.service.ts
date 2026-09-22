import type { PageQuery } from '@shop/contracts/conventions';
import type {
  ExpressCompany,
  ExpressCompanyForm,
  ExpressCompanyListQuery,
  ExpressCompanyRow,
} from '@shop/contracts/shipping/schemas';
import type { Ctx } from '../kernel/context';
import { DomainError } from '../kernel/errors';
import { fromId, toId } from '../kernel/ids';
import * as repo from './shipping.repo';

/**
 * 快递公司.
 *
 * Two surfaces over one table, which is the whole point of CR-1-b2:
 *
 *  - `pickerList` answers the 发货 form and the mobile staff console on the
 *    paths B2 already published, with the body B2 already published. It moved
 *    here from `order.fulfil.service.ts` unchanged — enabled rows only, most
 *    used first — so the two callers changed an import and nothing else.
 *  - the `admin*` functions are the management screen, which sees disabled rows
 *    too and costs `shipping:express:*`.
 *
 * Nothing here is transactional beyond a single statement: the table is a flat
 * list of 1101 seeded carriers with no aggregate around it.
 */

// ---------------------------------------------------------------------------
// the picker (paths frozen by CR-1-b2)
// ---------------------------------------------------------------------------

export async function pickerList(ctx: Ctx): Promise<{ items: ExpressCompany[] }> {
  const rows = await repo.listEnabledExpressCompanies(ctx.db);
  return { items: rows.map(toPicker) };
}

// ---------------------------------------------------------------------------
// management
// ---------------------------------------------------------------------------

export async function adminList(
  ctx: Ctx,
  query: ExpressCompanyListQuery,
): Promise<{ items: ExpressCompanyRow[]; total: number; page: number; pageSize: number }> {
  const { rows, total } = await repo.listExpressCompanies(ctx.db, {
    keyword: query.keyword,
    isEnabled: query.isEnabled,
    sortBy: query.sortBy as repo.ExpressSortKey | undefined,
    sortOrder: query.sortOrder,
    ...pageBounds(query),
  });
  return { items: rows.map(toRow), total, page: query.page, pageSize: query.pageSize };
}

export async function adminCreate(ctx: Ctx, body: ExpressCompanyForm): Promise<ExpressCompanyRow> {
  try {
    return toRow(await repo.insertExpressCompany(ctx.db, body));
  } catch (error) {
    if (repo.isDuplicateCode(error))
      throw new DomainError('SHIPPING_EXPRESS_COMPANY_CODE_TAKEN', {
        details: { code: body.code },
      });
    throw error;
  }
}

export async function adminUpdate(
  ctx: Ctx,
  params: { id: string },
  body: ExpressCompanyForm,
): Promise<ExpressCompanyRow> {
  try {
    const row = await repo.updateExpressCompany(ctx.db, fromId(params.id), body);
    if (row === null) throw new DomainError('SHIPPING_EXPRESS_COMPANY_NOT_FOUND');
    return toRow(row);
  } catch (error) {
    if (repo.isDuplicateCode(error))
      throw new DomainError('SHIPPING_EXPRESS_COMPANY_CODE_TAKEN', {
        details: { code: body.code },
      });
    throw error;
  }
}

export async function adminSetStatus(
  ctx: Ctx,
  params: { id: string },
  body: { isEnabled: boolean },
): Promise<ExpressCompanyRow> {
  const row = await repo.updateExpressCompany(ctx.db, fromId(params.id), {
    isEnabled: body.isEnabled,
  });
  if (row === null) throw new DomainError('SHIPPING_EXPRESS_COMPANY_NOT_FOUND');
  return toRow(row);
}

/**
 * Hard delete, and it is meant to be rare: 停用 is how a carrier retires.
 *
 * A row a shipment or a return points at cannot go — the foreign keys are
 * `restrict` and `set null`, and a parcel that lost its carrier name is a
 * support ticket. The refusal is read off the database's own error rather than
 * a pre-flight count, because a count would race with the shipment created a
 * millisecond later.
 */
export async function adminDelete(ctx: Ctx, params: { id: string }): Promise<{ deleted: true }> {
  const id = fromId(params.id);
  try {
    const affected = await repo.deleteExpressCompany(ctx.db, id);
    if (affected === 0) throw new DomainError('SHIPPING_EXPRESS_COMPANY_NOT_FOUND');
    return { deleted: true };
  } catch (error) {
    if (repo.isReferencedElsewhere(error)) {
      throw new DomainError('SHIPPING_EXPRESS_COMPANY_IN_USE');
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// row -> wire
// ---------------------------------------------------------------------------

function toPicker(row: repo.ExpressCompanyRow): ExpressCompany {
  return { id: toId(row.id), code: row.code, name: row.name, sortOrder: row.sortOrder };
}

function toRow(row: repo.ExpressCompanyRow): ExpressCompanyRow {
  return {
    ...toPicker(row),
    isEnabled: row.isEnabled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function pageBounds(query: PageQuery): { offset: number; limit: number } {
  return { offset: (query.page - 1) * query.pageSize, limit: query.pageSize };
}
