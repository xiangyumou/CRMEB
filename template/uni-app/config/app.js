// Storefront transport configuration.
//
// `HTTP_REQUEST_URL` keeps its old semantics — the API *origin*, without a trailing
// slash — so existing H5 / mini-program build configs and the many pages that use it
// as an image host keep working. What changed is the path prefix underneath it:
// the storefront now talks to `/api/v1/...` instead of `/api/...`.

// #ifdef MP
// 请求域名 格式： https://您的域名
const ORIGIN = process.env.VUE_APP_CRMEB_API_ORIGIN || '';
// #endif

// #ifdef H5
// H5接口是浏览器地址，非单独部署不用修改
const ORIGIN = window.location.protocol + '//' + window.location.host;
// #endif

// #ifdef APP-PLUS
const ORIGIN = process.env.VUE_APP_CRMEB_API_ORIGIN || '';
// #endif

/**
 * Client platform, recomputed on every call — never cached in a shared header object.
 * The server reads it from `X-Client-Platform` and uses it to pick the WeChat Pay flow.
 *
 * `h5`          plain mobile browser
 * `wechat-oa`   WeChat's embedded browser (公众号 / JSAPI)
 * `wechat-mini` WeChat mini program
 */
function clientPlatform() {
  // #ifdef MP-WEIXIN
  return 'wechat-mini';
  // #endif
  // #ifdef H5
  const ua = typeof navigator === 'undefined' ? '' : String(navigator.userAgent || '');
  return ua.toLowerCase().indexOf('micromessenger') !== -1 ? 'wechat-oa' : 'h5';
  // #endif
  // #ifndef MP-WEIXIN || H5
  return 'h5';
  // #endif
}

module.exports = {
  // API origin, no trailing slash. Also used as the image host by many pages.
  HTTP_REQUEST_URL: ORIGIN.replace(/\/+$/, ''),
  // Path prefix of every storefront route. `api/*.js` spells the rest of the path out.
  API_PREFIX: '/api/v1',
  // Recomputed per request; see `utils/request.js`.
  clientPlatform,
  // Session header name. Bearer token, RFC 6750.
  TOKENNAME: 'Authorization',
  // 缓存时间 0 永久
  EXPIRE: 0,
  // 分页最多显示条数
  LIMIT: 10,
  // 请求超时限制，15 秒
  TIMEOUT: 15000,
  // 购物车数量输入防抖间隔
  DEBOUNCETIME: 500,
};
