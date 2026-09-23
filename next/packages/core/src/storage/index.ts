/**
 * `storage` — the media library, the upload doors and the two defences the old
 * system did not have.
 *
 * | Caller | Entry point |
 * | --- | --- |
 * | `GET /admin-api/attachment-categories` | `categoryTree` |
 * | `POST/PUT/DELETE /admin-api/attachment-categories` | `categoryCreate` / `categoryUpdate` / `categoryDelete` |
 * | `GET /admin-api/attachments` | `attachmentList` |
 * | `PUT /admin-api/attachments/:id` | `attachmentUpdate` |
 * | `POST /admin-api/attachments` | `attachmentUpload` |
 * | `POST /admin-api/attachments/imports` | `attachmentImport` |
 * | `POST /admin-api/attachments/deletions` / `…/moves` | `attachmentDeleteMany` / `attachmentMoveMany` |
 * | `POST /admin-api/attachments/scan-tokens` | `scanTokenCreate` |
 * | `GET /admin-api/attachments/scan-tokens/:token` | `scanTokenStatusGet` |
 * | `POST /api/v1/uploads` | `userUpload` |
 * | `POST /api/v1/attachments/scan-uploads/:token` | `scanUpload` |
 * | worker `storage.cleanOrphans` | `cleanOrphanAttachments` |
 * | any domain needing a file | `resolveStorage(ctx)` → the configured driver |
 *
 * **Other streams:** do not call `ctx.storage.put` directly if the file should
 * appear in the media library — call `attachmentUpload` (or `storeFile` through
 * it) so the bytes are sniffed, deduped and recorded. `ctx.storage` is for
 * generated artefacts nobody browses, such as an export .xlsx.
 *
 * `safeFetch` is exported because it is the **only** sanctioned way to fetch a
 * user-supplied URL anywhere in the system (CONVENTIONS).
 */
export {
  attachmentDeleteMany,
  attachmentImport,
  attachmentList,
  attachmentMoveMany,
  attachmentUpdate,
  attachmentUpload,
  categoryCreate,
  categoryDelete,
  categoryTree,
  categoryUpdate,
  resetStorageDriverCache,
  resolveStorage,
  scanTokenCreate,
  scanTokenStatusGet,
  scanUpload,
  SCAN_UPLOADS_PER_IP_PER_HOUR,
  SCAN_UPLOADS_PER_TOKEN,
  userUpload,
  type IncomingFile,
  type ResolvedStorage,
} from './storage.service';

export { cleanOrphanAttachments, type SweepReport } from './storage.jobs';
export { storagePermissions } from './permissions';
export { storageConfig } from './storage.config';
export { storageDashboardContributor } from './dashboard-tiles';
export { readFilePart } from './multipart';

export {
  isRejected,
  mimeAgrees,
  probeImageDimensions,
  sniffFileType,
  type Dimensions,
  type SniffedKind,
  type SniffResult,
} from './file-type';
export {
  classifyAddress,
  safeFetch,
  SafeFetchError,
  type PinnedRequest,
  type SafeFetchOptions,
  type SafeFetchResult,
  type Transport,
} from './safe-fetch';
export { createS3Storage, signS3Request, S3Error, type S3Options } from './s3';
export { createScanTokenStore, type ScanTokenStore } from './scan-token';
export * as attachmentRepo from './storage.repo';
