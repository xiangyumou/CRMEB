import { errorBody, type ErrorBody } from './contracts';

/**
 * Every failure that leaves `callRoute` is an `ApiError`, including transport
 * failures (`status: 0`). Pages branch on `code`, never on `message`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(init: { status: number; code: string; message: string; details?: unknown }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
  }

  /** 422 field errors as `{ fieldPath: message }`, or `null` if this isn't one. */
  get fieldErrors(): Record<string, string> | null {
    return parseFieldErrors(this.details);
  }

  static is(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }
}

/** Transport-level codes that never come from the server. */
export const CLIENT_ERROR_CODES = {
  network: 'NETWORK_ERROR',
  parse: 'RESPONSE_PARSE_FAILED',
  schema: 'RESPONSE_SCHEMA_MISMATCH',
  aborted: 'REQUEST_ABORTED',
} as const;

const STATUS_FALLBACK_MESSAGE: Record<number, string> = {
  400: '请求有误',
  401: '请先登录',
  403: '没有权限执行此操作',
  404: '资源不存在',
  409: '操作冲突，请刷新后重试',
  422: '提交的数据有误',
  429: '操作过于频繁，请稍后再试',
  500: '服务器开小差了，请稍后再试',
  502: '服务暂时不可用，请稍后再试',
  503: '服务暂时不可用，请稍后再试',
};

/**
 * Turns whatever the server sent on a non-2xx into an `ApiError`. A body that
 * does not match `errorBody` is not trusted for anything but a status fallback.
 */
export function toApiError(status: number, payload: unknown): ApiError {
  const parsed = errorBody.safeParse(payload);
  if (parsed.success) {
    const body: ErrorBody = parsed.data;
    return new ApiError({
      status,
      code: body.code,
      message: body.message,
      details: body.details,
    });
  }
  return new ApiError({
    status,
    code: `HTTP_${status}`,
    message: STATUS_FALLBACK_MESSAGE[status] ?? '请求失败，请稍后再试',
  });
}

/**
 * Normalises the shapes a 422 `details` may take into `{ path: message }`:
 * - `{ fieldErrors: { name: ['必填'] } }`  (zod `flatten()`)
 * - `{ name: '必填' }`                      (flat map)
 * - `[{ path: ['a', 0, 'b'], message }]`    (zod `issues`)
 */
export function parseFieldErrors(details: unknown): Record<string, string> | null {
  if (!details || typeof details !== 'object') return null;

  if (Array.isArray(details)) {
    const out: Record<string, string> = {};
    for (const issue of details) {
      if (!issue || typeof issue !== 'object') continue;
      const rec = issue as { path?: unknown; message?: unknown };
      const path = Array.isArray(rec.path) ? rec.path.join('.') : undefined;
      if (path && typeof rec.message === 'string' && !(path in out)) out[path] = rec.message;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  const rec = details as Record<string, unknown>;
  const nested = rec['fieldErrors'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return parseFieldErrors(nested);
  }
  if (Array.isArray(rec['issues'])) {
    return parseFieldErrors(rec['issues']);
  }

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value) && typeof value[0] === 'string') out[key] = value[0];
  }
  return Object.keys(out).length > 0 ? out : null;
}
