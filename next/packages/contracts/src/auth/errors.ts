import { defineErrors } from '../_conventions/errors';

export const authErrors = defineErrors({
  AUTH_INVALID_CREDENTIALS: { status: 401, message: '账号或密码不正确' },
  AUTH_ACCOUNT_DISABLED: { status: 403, message: '账号已被禁用，请联系管理员' },
  /** Per-account throttle. Everything sits behind one shared proxy, so per-IP would be useless. */
  AUTH_TOO_MANY_ATTEMPTS: { status: 429, message: '登录尝试过于频繁，请稍后再试' },
  AUTH_CAPTCHA_REQUIRED: { status: 400, message: '请先完成滑块验证' },
  AUTH_CAPTCHA_INVALID: { status: 400, message: '滑块验证未通过，请重试' },
  AUTH_SESSION_EXPIRED: { status: 401, message: '登录已过期，请重新登录' },
  /** The cookie-auth CSRF guard (Origin / Sec-Fetch-Site) rejected the request. */
  AUTH_CROSS_SITE_BLOCKED: { status: 403, message: '请求来源不可信' },
});

export type AuthErrorCode = keyof typeof authErrors;
