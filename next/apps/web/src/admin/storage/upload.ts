import { getApiConfig } from '../api/config';
import type { AnyRouteDef, ResponseOf } from '../api/contracts';
import { ApiError, CLIENT_ERROR_CODES, toApiError } from '../api/errors';
import { buildUrl } from '../api/url';

/**
 * `callRoute` for a file.
 *
 * The kit's `callRoute` only sends JSON, and an upload is `multipart/form-data`
 * — which is also why the upload routes declare no `body` and carry their
 * options in `query`. This is the local adapter for that gap; CR-4-f1 asks for
 * it in the kit, and when it lands this file becomes a re-export.
 *
 * Everything else matches `callRoute` deliberately: same URL builder, same
 * cookie handling, same `ApiError` mapping, so a 413 or a 422 from an upload
 * reaches the UI looking exactly like one from any other route.
 */
export async function uploadFile<R extends AnyRouteDef>(
  route: R,
  input: {
    params?: Record<string, unknown> | undefined;
    query?: Record<string, unknown> | undefined;
  },
  file: File,
  options: { signal?: AbortSignal | undefined; fieldName?: string | undefined } = {},
): Promise<ResponseOf<R>> {
  const cfg = getApiConfig();
  const url = buildUrl(cfg.baseUrl, route.path, input.params, input.query);

  const form = new FormData();
  form.append(options.fieldName ?? 'file', file, file.name);

  const init: RequestInit = {
    method: route.method,
    // No `Content-Type`: the browser must set it, boundary and all.
    headers: { Accept: 'application/json' },
    body: form,
    credentials: 'include',
    cache: 'no-store',
  };
  if (options.signal) init.signal = options.signal;

  let response: Response;
  try {
    response = await cfg.fetch(url, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new ApiError({ status: 0, code: CLIENT_ERROR_CODES.aborted, message: '上传已取消' });
    }
    throw new ApiError({
      status: 0,
      code: CLIENT_ERROR_CODES.network,
      message: '网络连接失败，请检查网络后重试',
      details: cause instanceof Error ? cause.message : undefined,
    });
  }

  const text = await response.text();
  const payload: unknown = text.length > 0 ? safeParse(text) : undefined;

  if (!response.ok) {
    const error = toApiError(response.status, payload);
    if (response.status === 401) cfg.onUnauthenticated();
    throw error;
  }

  return payload as ResponseOf<R>;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
