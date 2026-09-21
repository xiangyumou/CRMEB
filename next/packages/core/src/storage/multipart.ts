import { DomainError } from '../kernel/errors';
import type { IncomingFile } from './storage.service';

/**
 * Pulling the one file part out of a `multipart/form-data` request.
 *
 * `handle()` (orchestrator-owned) parses JSON bodies and nothing else, which is
 * why the upload contracts declare no `body` and carry their options in the
 * query string. The route therefore reads the form itself, and this is the
 * shared half so that four routes do not each invent their own field name and
 * their own error.
 *
 * It lives in `core` rather than in the route because `FormData`, `File` and
 * `Blob` are web standards available in Node, not `next/*` imports — the
 * `boundaries` rule is about framework coupling, and there is none here.
 *
 * The filename is read but never used as a path: `Storage.put` takes it as a
 * *hint* and honours only a whitelisted extension.
 */

const FIELD_NAMES = ['file', 'multipart', 'image'] as const;

export async function readFilePart(request: {
  formData(): Promise<FormData>;
}): Promise<IncomingFile> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // A malformed or absent multipart body is a client error, not a 500.
    throw new DomainError('STORAGE_NO_FILE');
  }

  // `file` is the name the admin kit and the uploader both send. `multipart`
  // and `image` are what the old uni-app pages sent, and the storefront build
  // of those pages will outlive this rewrite by a release or two.
  //
  // The part is narrowed structurally rather than with `instanceof File`: this
  // package does not load the DOM lib, and a `Blob` without a filename is still
  // a perfectly good upload.
  let part: unknown = null;
  for (const name of FIELD_NAMES) {
    part = form.get(name);
    if (part !== null && typeof part !== 'string') break;
    part = null;
  }
  if (part === null || typeof part !== 'object' || !('arrayBuffer' in part)) {
    throw new DomainError('STORAGE_NO_FILE');
  }
  const blob = part as { arrayBuffer(): Promise<ArrayBuffer>; name?: unknown; type?: unknown };

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) throw new DomainError('STORAGE_NO_FILE');

  const filename = typeof blob.name === 'string' && blob.name !== '' ? blob.name : undefined;
  const declaredMime = typeof blob.type === 'string' && blob.type !== '' ? blob.type : undefined;
  return { bytes, filename, declaredMime };
}
