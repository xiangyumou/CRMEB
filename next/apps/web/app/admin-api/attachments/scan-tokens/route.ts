import { storageScanTokenCreate } from '@shop/contracts/storage/storage.admin.contract';
import * as storage from '@shop/core/storage';
import { handle } from '../../../../src/server';

/**
 * `/admin-api/attachments/scan-tokens` — mint a QR code for 扫码上传.
 *
 * Per admin, single-use, ten minutes. The old system kept **one** token under a
 * fixed cache key, so a phone scanning an older code uploaded into whichever
 * admin had opened the dialog most recently.
 */
export const POST = handle(storageScanTokenCreate, (ctx, { query }) =>
  storage.scanTokenCreate(ctx, query),
);

export const dynamic = 'force-dynamic';
