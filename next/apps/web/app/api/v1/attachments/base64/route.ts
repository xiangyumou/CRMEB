import { systemAttachmentDataUrl } from '@shop/contracts/system/system.attachment.contract';
import * as system from '@shop/core/system';
import { handle } from '../../../../../src/server';

/**
 * `/api/v1/attachments/base64` — one of our own images, inline (CR-7-h2).
 *
 * The 海报 canvas cannot export once a cross-origin image has been drawn on it,
 * so the app asks for the bytes. Only this shop's own attachments are fetched,
 * and only through `safeFetch`.
 */
export const POST = handle(systemAttachmentDataUrl, (ctx, { body }) =>
  system.attachmentDataUrl(ctx, body),
);

export const dynamic = 'force-dynamic';
