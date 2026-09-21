// Storefront HTTP client.
//
// Talks to the new REST API (`/api/v1/...`): JSON in, JSON out, real HTTP status codes,
// `Authorization: Bearer <token>` and a per-request `X-Client-Platform`.
//
// The value it resolves with is deliberately *not* the raw DTO — see `api/README.md`.
// Pages were written against the old envelope and read `res.data` and `res.msg`, so the
// client resolves `{ data, msg, status: 200 }` and the `api/*.js` modules hand it a
// `map` function that turns the new camelCase DTO into the snake_case view model the
// pages already know. Rejections are always objects and always carry both `message`
// and its alias `msg`, because pages toast `err` or `err.msg`.

import { HTTP_REQUEST_URL, API_PREFIX, TOKENNAME, TIMEOUT, clientPlatform } from '../config/app';
import { toLogin, checkLogin } from '../libs/login';
import store from '../store';
import i18n from './lang.js';

/** Network / transport failure: no HTTP response at all. */
export const NETWORK_ERROR = 'NETWORK';
/** The request never left the client because there is no session. */
export const UNAUTHENTICATED = 'UNAUTHENTICATED';

const DEFAULT_ERROR_CODE = 'HTTP_ERROR';

/**
 * Single-flight guard for the 401 → login redirect. A screen that fires six requests on
 * mount must not push the login page six times. Reset by the next successful response so
 * a later session expiry is handled again.
 */
let loginPromptInFlight = false;

/** Test seam: forget that the login prompt was shown. */
export function resetLoginPrompt() {
  loginPromptInFlight = false;
}

function promptLogin() {
  if (loginPromptInFlight) return;
  loginPromptInFlight = true;
  toLogin();
}

function t(key) {
  // `i18n` is absent in unit tests; fall back to the key, which is already Chinese.
  try {
    return i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
  } catch (e) {
    return key;
  }
}

/**
 * The success `msg`. The new API says "it worked" with the status line and sends no
 * message, but 71 call sites toast `res.msg`, so an `api/*.js` function that needs a
 * toast supplies one through `opt.msg` (a string, or a function of the raw payload).
 */
function envelopeMessage(msg, payload) {
  if (typeof msg === 'function') {
    try {
      return String(msg(payload) || '');
    } catch (e) {
      return '';
    }
  }
  return typeof msg === 'string' ? msg : '';
}

/** Reject value shared by every failure path. `msg` is an alias of `message`. */
function failure(status, code, message, details) {
  const err = { status, code, message, msg: message };
  if (details !== undefined && details !== null) err.details = details;
  return err;
}

/**
 * Headers, built fresh for every request. Nothing is cached at module level: the old
 * client wrote the token into a shared `HEADER` object, so a token survived logout and
 * leaked into later `noAuth` calls.
 */
function buildHeaders(token, extra) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Client-Platform': clientPlatform(),
  };
  if (token) headers[TOKENNAME] = `Bearer ${token}`;
  return extra ? Object.assign(headers, extra) : headers;
}

/** `/api/v1/orders/9001` → absolute URL; a query object is appended for GET/DELETE. */
function buildUrl(path, query) {
  const base = `${HTTP_REQUEST_URL}${path.charAt(0) === '/' ? '' : API_PREFIX + '/'}${path}`;
  const qs = encodeQuery(query);
  return qs ? `${base}${base.indexOf('?') === -1 ? '?' : '&'}${qs}` : base;
}

function encodeQuery(query) {
  if (!query || typeof query !== 'object') return '';
  const parts = [];
  for (const key of Object.keys(query)) {
    const value = query[key];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const v of value) parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

const BODYLESS = { GET: true, DELETE: true };

/**
 * @param {string} path    full storefront path, e.g. `/api/v1/cart`
 * @param {string} method  GET | POST | PUT | PATCH | DELETE
 * @param {object} data    query params for GET/DELETE, JSON body otherwise
 * @param {object} [opt]
 * @param {boolean} [opt.noAuth]  send without a session, and do not redirect to login
 * @param {function} [opt.map]    payload → legacy view model; applied before resolving
 * @param {string|function} [opt.msg]  envelope `msg` for a page that toasts `res.msg`
 * @param {object} [opt.query]    extra query params for a request that also has a body
 * @param {object} [opt.headers]  extra headers
 * @param {number} [opt.timeout]
 */
function baseRequest(path, method, data, opt) {
  const options = opt || {};
  const verb = String(method || 'GET').toUpperCase();
  const token = store.state.app.token;

  if (!options.noAuth && !token && !checkLogin()) {
    promptLogin();
    return Promise.reject(failure(401, UNAUTHENTICATED, t('未登录')));
  }

  const bodyless = BODYLESS[verb];
  const url = buildUrl(path, bodyless ? Object.assign({}, data, options.query) : options.query);
  const headers = buildHeaders(options.noAuth ? null : store.state.app.token, options.headers);

  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: verb,
      header: headers,
      data: bodyless ? undefined : data || {},
      timeout: options.timeout || TIMEOUT,
      success: (res) => {
        const status = res.statusCode;
        const payload = res.data;

        if (status >= 200 && status < 300) {
          loginPromptInFlight = false;
          let mapped = payload;
          if (typeof options.map === 'function') {
            try {
              mapped = options.map(payload);
            } catch (e) {
              reject(failure(status, 'MAP_ERROR', e && e.message ? e.message : t('数据解析失败')));
              return;
            }
          }
          resolve({ data: mapped, msg: envelopeMessage(options.msg, payload), status: 200 });
          return;
        }

        const body = payload && typeof payload === 'object' ? payload : {};
        const message = body.message || t('系统错误');

        if (status === 401) {
          store.commit('LOGOUT');
          if (!options.noAuth) promptLogin();
          reject(failure(401, body.code || 'UNAUTHORIZED', message, body.details));
          return;
        }

        reject(failure(status, body.code || DEFAULT_ERROR_CODE, message, body.details));
      },
      fail: (err) => {
        // No HTTP response: DNS, offline, abort, or the 15 s timeout.
        reject(failure(0, NETWORK_ERROR, (err && err.errMsg) || t('请求失败')));
      },
    });
  });
}

const request = {};

for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
  request[method] = (path, data, opt) => baseRequest(path, method, data, opt);
}

export { baseRequest };
export default request;
