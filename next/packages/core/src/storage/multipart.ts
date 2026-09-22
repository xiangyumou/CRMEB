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
 * The field is `file` and only `file` (CR-5-h §1). It used to accept `image`
 * and `multipart` too, which meant the contract could not state a name and a
 * client sending the wrong one silently worked here and nowhere else. Extra
 * file parts under other names are ignored; a file under *only* another name
 * is `STORAGE_UPLOAD_FIELD_MISSING`.
 *
 * The filename is read but never used as a path: `Storage.put` takes it as a
 * *hint* and honours only a whitelisted extension.
 */

/**
 * The one field name the contract names (CR-5-h §1). Anything else is a client
 * bug, and saying so beats the shopper re-picking the same photo.
 */
const FIELD_NAME = 'file';

/** Structural: any part that can hand back bytes is a file part. */
const isFilePart = (value: unknown): value is { arrayBuffer(): Promise<ArrayBuffer> } =>
  value !== null && typeof value === 'object' && 'arrayBuffer' in value;

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

  // The part is narrowed structurally rather than with `instanceof File`: this
  // package does not load the DOM lib, and a `Blob` without a filename is still
  // a perfectly good upload.
  const part: unknown = form.get(FIELD_NAME);
  if (!isFilePart(part)) {
    // A file under another name is a different failure from no file at all: it
    // is one word away from working, and the caller is told which word.
    const misnamed = [...form.keys()].filter(
      (name) => name !== FIELD_NAME && isFilePart(form.get(name)),
    );
    if (misnamed.length > 0) {
      throw new DomainError('STORAGE_UPLOAD_FIELD_MISSING', {
        details: { expected: FIELD_NAME, received: misnamed },
      });
    }
    throw new DomainError('STORAGE_NO_FILE');
  }
  const blob = part as { arrayBuffer(): Promise<ArrayBuffer>; name?: unknown; type?: unknown };

  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength === 0) throw new DomainError('STORAGE_NO_FILE');

  const filename = typeof blob.name === 'string' && blob.name !== '' ? blob.name : undefined;
  const declaredMime = typeof blob.type === 'string' && blob.type !== '' ? blob.type : undefined;
  return { bytes, filename, declaredMime };
}
