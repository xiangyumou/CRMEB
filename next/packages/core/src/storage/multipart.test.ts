import { describe, expect, it } from 'vitest';
import { DomainError } from '../kernel/errors';
import { readFilePart } from './multipart';

/**
 * The multipart field name is part of the contract.
 *
 * Accepting three names — `file`, `multipart`, `image` — would mean the
 * contract could not state one, `openapi.json` could not describe the request,
 * and a client sending a fourth would fail with "请选择要上传的文件" no matter
 * how many times the shopper picked the photo. One name, and a distinct error
 * for the client that used another.
 */

const asRequest = (form: FormData) => ({ formData: async () => form });

const blob = (content = 'png-bytes', name = 'photo.png', type = 'image/png') =>
  new File([content], name, { type });

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(DomainError);
  return (error as DomainError).code;
}

describe('readFilePart', () => {
  it('reads the part named file', async () => {
    const form = new FormData();
    form.set('file', blob());

    const part = await readFilePart(asRequest(form));
    expect(part.filename).toBe('photo.png');
    expect(part.declaredMime).toBe('image/png');
    expect(new TextDecoder().decode(part.bytes)).toBe('png-bytes');
  });

  it('names the fix when the file arrived under another field', async () => {
    for (const wrong of ['image', 'multipart', 'avatar']) {
      const form = new FormData();
      form.set(wrong, blob());

      const error = await readFilePart(asRequest(form)).then(
        () => null,
        (caught: unknown) => caught as DomainError,
      );
      expect(error?.code).toBe('STORAGE_UPLOAD_FIELD_MISSING');
      expect(error?.details).toEqual({ expected: 'file', received: [wrong] });
    }
  });

  it('ignores extra file parts, because `file` is the upload', async () => {
    const form = new FormData();
    form.set('file', blob('the-one', 'wanted.png'));
    form.set('thumbnail', blob('ignored', 'other.png'));

    const part = await readFilePart(asRequest(form));
    expect(part.filename).toBe('wanted.png');
  });

  it('is STORAGE_NO_FILE when there is no file at all, only text fields', async () => {
    const form = new FormData();
    form.set('purpose', 'review');
    expect(await codeOf(readFilePart(asRequest(form)))).toBe('STORAGE_NO_FILE');
  });

  it('is STORAGE_NO_FILE for an empty part, not a field-name complaint', async () => {
    const form = new FormData();
    form.set('file', blob(''));
    expect(await codeOf(readFilePart(asRequest(form)))).toBe('STORAGE_NO_FILE');
  });

  it('turns a malformed body into a 4xx rather than a 500', async () => {
    const request = {
      formData: async () => {
        throw new Error('boundary not found');
      },
    };
    expect(await codeOf(readFilePart(request))).toBe('STORAGE_NO_FILE');
  });
});
