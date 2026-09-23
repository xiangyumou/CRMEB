'use client';

import { App } from 'antd';
import { useEffect } from 'react';

import { ApiError, CLIENT_ERROR_CODES } from './errors';

/** What the presenter needs from antd. Swappable so tests can assert on it. */
export interface ApiFeedback {
  error(error: ApiError): void;
  success(text: string): void;
}

let current: ApiFeedback | null = null;

export function setApiFeedback(feedback: ApiFeedback | null): void {
  current = feedback;
}

/**
 * Shows an `ApiError` to the operator. Called from the TanStack Query caches,
 * so it covers every query and mutation unless the call opts out with
 * `presentError: false`.
 *
 * Silent by design for: aborted requests (a navigation, not a failure) and 401
 * (the client is already navigating to the login page).
 */
export function presentApiError(error: unknown): void {
  if (!ApiError.is(error)) {
    current?.error(
      new ApiError({ status: 0, code: 'UNKNOWN', message: '发生未知错误，请稍后重试' }),
    );
    return;
  }
  if (error.code === CLIENT_ERROR_CODES.aborted) return;
  if (error.status === 401) return;
  current?.error(error);
}

export function presentSuccess(text: string): void {
  current?.success(text);
}

/**
 * Installs antd's `message` / `notification` instances (taken from `<App/>`, so
 * they inherit theme and locale — antd 6 static methods do not) as the global
 * presenter. Mounted once, inside `<App/>`, by `AdminProviders`.
 */
export function ApiFeedbackBridge(): null {
  const { message, notification } = App.useApp();

  useEffect(() => {
    setApiFeedback({
      error(error) {
        if (error.status >= 500 || error.status === 0) {
          notification.error({
            message: '请求失败',
            description: `${error.message}（${error.code}）`,
            placement: 'topRight',
          });
          return;
        }
        void message.error(error.message);
      },
      success(text) {
        void message.success(text);
      },
    });
    return () => setApiFeedback(null);
  }, [message, notification]);

  return null;
}
