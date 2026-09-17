// +---------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +---------------------------------------------------------------------
// | Copyright (c) 2016~2023 https://www.crmeb.com All rights reserved.
// +---------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +---------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +---------------------------------------------------------------------

import axios from 'axios';
import { Message } from 'element-ui';
import { getCookies, removeCookies } from '@/libs/util';
import Setting from '@/setting';
import router from '@/router';
const service = axios.create({
  baseURL: Setting.apiBaseURL,
  timeout: 100000, // 请求超时时间
});

const getRequestErrorMessage = (error) => {
  const response = error && error.response;
  const data = response && response.data;
  if (data && data.msg) return data.msg;
  if (data && data.message) return data.message;
  if (error && error.msg) return error.msg;
  if (error && (error.code === 'ECONNABORTED' || (error.message && error.message.indexOf('timeout') !== -1))) {
    return '请求超时，请稍后重试';
  }
  if (!response) return '网络连接失败，请检查网络后重试';
  if (response.status) return `请求失败（HTTP ${response.status}）`;
  return '请求失败，请稍后重试';
};

// 响应体只用于控制台排查，过长时截断
const bodySnippet = (data, limit = 500) => {
  let text = '';
  try {
    text = typeof data === 'string' ? data : JSON.stringify(data);
  } catch (e) {
    text = String(data);
  }
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

const isAbsoluteUrl = (url) => /^[a-z][a-z\d+\-.]*:\/\//i.test(url);

// axios 0.18 在 dispatchRequest 里会把 baseURL 合并进 config.url，日志里不能再拼一次
const requestUrl = (config) => {
  if (!config) return '';
  const url = config.url || '';
  if (!url) return config.baseURL || '';
  return isAbsoluteUrl(url) ? url : `${config.baseURL || ''}${url}`;
};

// 服务端返回的不是接口约定的 JSON（PHP 报错输出、网关或代理页面、被截断的响应等）时统一走这里
const unexpectedBody = (response) => {
  const msg = `服务端返回异常响应（HTTP ${response.status}），请查看控制台`;
  console.error('[request] 响应内容不符合接口约定:', requestUrl(response.config), response.status, bodySnippet(response.data));
  return { msg, _messageShown: true, _rawBody: response.data };
};

/**
 * 页面里的 .catch 统一用它提示：error 上没有 msg 时用兜底文案，
 * 拦截器已经提示过的错误不再重复提示，避免弹出只有图标没有文字的空白提示框。
 * @param {object} error 拦截器 reject 出来的对象，或 .then 里抛出的原生异常
 * @param {string} fallback 兜底文案
 */
export const showApiError = (error, fallback = '操作失败，请稍后重试') => {
  if (error && error._messageShown) return;
  Message.error((error && error.msg) || fallback);
};

axios.defaults.withCredentials = true; // 携带cookie

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    if (config.kefu) {
      let baseUrl = Setting.apiBaseURL.replace(/adminapi/, 'kefuapi');
      config.baseURL = baseUrl;
    } else {
      config.baseURL = Setting.apiBaseURL;
    }
    if (config.file) {
      config.headers['Content-Type'] = 'multipart/form-data';
    }
    const token = getCookies('token');
    const kefuToken = getCookies('kefu_token');
    if (token || kefuToken) {
      config.headers['Authori-zation'] = config.kefu ? 'Bearer ' + kefuToken : 'Bearer ' + token;
    }
    return config;
  },
  (error) => {
    // do something with request error
    return Promise.reject(error);
  },
);

// response interceptor
service.interceptors.response.use(
  (response) => {
    let obj = {};
    if (!!response.data) {
      if (typeof response.data == 'string') {
        try {
          obj = JSON.parse(response.data);
        } catch (e) {
          return Promise.reject(unexpectedBody(response));
        }
      } else {
        obj = response.data;
      }
    }
    // 解析出来不是对象（比如响应体是 "null"、数字、布尔）时不能直接取 status，否则会抛出没有 msg 的异常
    if (!obj || typeof obj !== 'object') {
      return Promise.reject(unexpectedBody(response));
    }
    let status = response.data ? obj.status : 0;
    // let status = response.data ? response.data.status : 0;
    const code = status;
    switch (code) {
      case 200:
        return obj;
      case 401:
        localStorage.clear();
        removeCookies('token');
        removeCookies('expires_time');
        removeCookies('uuid');
        router.replace({ name: 'login' }).catch(() => {});
        return Promise.reject({ msg: '未登录' });
      case 402:
        removeCookies('kefuInfo');
        removeCookies('kefu_token');
        removeCookies('kefu_expires_time');
        removeCookies('kefu_uuid');
        router.replace({ path: '/kefu' }).catch(() => {});
        return Promise.reject({ msg: '未登录' });
      case 403:
        router.replace({ name: 'system_opendir_login' }).catch(() => {});
        return Promise.reject({ msg: '没有权限' });
      default: {
        const result = obj && typeof obj === 'object' ? obj : {};
        result.msg = result.msg || '请求失败，请稍后重试';
        return Promise.reject(result);
      }
    }
  },
  (error) => {
    const result = error && typeof error === 'object' ? error : {};
    result.msg = getRequestErrorMessage(error);
    result._messageShown = true;
    if (error && error.response) {
      console.error('[request] 请求失败:', requestUrl(error.config), error.response.status, bodySnippet(error.response.data));
    } else {
      console.error('[request] 请求失败:', requestUrl(error && error.config), (error && error.message) || error);
    }
    Message.error(result.msg);
    return Promise.reject(result);
  },
);

export default service;
