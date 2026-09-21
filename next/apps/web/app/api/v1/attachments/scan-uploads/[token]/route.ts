import { storageScanUpload } from '@shop/contracts/storage/storage.storefront.contract';
import * as storage from '@shop/core/storage';
import { handle } from '../../../../../../src/server';

/**
 * `/api/v1/attachments/scan-uploads/:token` — the phone's half of 扫码上传.
 *
 * Public by contract, because the phone that scanned the code has no session:
 * the token *is* the authorisation. So it is claimed by an atomic Redis script
 * before anything is stored, exactly once, and the attachment is attributed to
 * the admin who minted it rather than to nobody.
 */
export const POST = handle(storageScanUpload, async (ctx, { params }) => {
  const file = await storage.readFilePart(ctx.request);
  return storage.scanUpload(ctx, params, file);
});

export const dynamic = 'force-dynamic';
