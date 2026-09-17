// +---------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +---------------------------------------------------------------------
// | Copyright (c) 2016~2023 https://www.crmeb.com All rights reserved.
// +---------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +---------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +---------------------------------------------------------------------

import { wss, getCookies, setCookies } from '@/libs/util';
import Setting from '@/setting';
import { getWorkermanUrl } from '@/api/common';
import Vue from 'vue';
const vm = new Vue();
let wsAdminSocketUrl = getCookies('WS_ADMIN_URL') || '';

class wsSocket {
  constructor(opt) {
    this.ws = null;
    this.opt = opt || {};
    this.init(opt.key);
  }

  onOpen(key = false) {
    this.opt.open && this.opt.open();
    let that = this;
    // this.send({
    //     type: 'login',
    //     data: util.cookies.get('token')
    // }).then(() => {
    //     that.ping();
    // });
    that.ping();
    this.socketStatus = true;
  }

  init(key) {
    let wsUrl = key == 1 ? wsAdminSocketUrl : '';
    if (wsUrl) {
      // 后端返回的可能是 ws:// 地址，HTTPS 页面上直接连接会被浏览器拦截，统一按页面协议转换
      this.ws = new WebSocket(wss(wsUrl));
      this.ws.onopen = this.onOpen.bind(this);
      this.ws.onerror = this.onError.bind(this);
      this.ws.onmessage = this.onMessage.bind(this);
      this.ws.onclose = this.onClose.bind(this);
    }
  }

  ping() {
    var that = this;
    this.timer = setInterval(function () {
      that.send({ type: 'ping' });
    }, 10000);
  }

  send(data) {
    return new Promise((resolve, reject) => {
      try {
        this.ws.send(JSON.stringify(data));
        resolve({ status: true });
      } catch (e) {
        reject({ status: false });
      }
    });
  }

  onMessage(res) {
    this.opt.message && this.opt.message(res);
  }

  onClose() {
    this.timer && clearInterval(this.timer);
    this.opt.close && this.opt.close();
  }

  onError(e) {
    this.opt.error && this.opt.error(e);
  }

  $on(...args) {
    vm.$on(...args);
  }

  $off(...args) {
    vm.$off(...args);
  }
}

function createSocket(key) {
  getWorkermanUrl().then((res) => {
    wsAdminSocketUrl = res.data.admin;
    setCookies('WS_ADMIN_URL', res.data.admin);
  });
  return new Promise((resolve, reject) => {
    const ws = new wsSocket({
      key,
      open() {
        resolve(ws);
        vm.$emit('socket_open', key);
      },
      error(e) {
        reject(e);
      },
      message(res) {
        const { type, data = {} } = JSON.parse(res.data);
        vm.$emit(type, data);
      },
      close(e) {
        vm.$emit('close', { e, key });
      },
    });
  });
}

export const adminSocket = createSocket(1);
