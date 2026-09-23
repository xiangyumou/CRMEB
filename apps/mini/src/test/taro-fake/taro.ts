/**
 * A fake `@tarojs/taro` for Vitest (aliased in vitest.config.mts). It implements the part of
 * the API the app uses and lets a test drive what the platform would: app show/hide, network
 * changes, page show/hide. Every platform call is recorded in `taroFake.calls`.
 *
 * Why a fake and not Taro's H5 implementation (`@tarojs/taro-h5`): the H5 build wires its
 * hooks and router up at app start, inside the webpack build; outside it `useDidShow` has no
 * page to attach to. A fake is also deterministic, which the lifecycle tests need.
 *
 * Grow it as the platform layer grows; plan: move it to `@shop/testing/taro` once
 * `packages/storefront-blocks` needs it too.
 */
import { useEffect, useLayoutEffect, useRef } from 'react';

type Listener<T> = (value: T) => void;

class Channel<T> {
  private readonly listeners = new Set<Listener<T>>();
  on = (listener: Listener<T>): void => {
    this.listeners.add(listener);
  };
  off = (listener: Listener<T>): void => {
    this.listeners.delete(listener);
  };
  emit(value: T): void {
    for (const listener of [...this.listeners]) listener(value);
  }
  get size(): number {
    return this.listeners.size;
  }
  clear(): void {
    this.listeners.clear();
  }
}

export interface NetworkStatus {
  isConnected: boolean;
  networkType: string;
}

const appShow = new Channel<void>();
const appHide = new Channel<void>();
const network = new Channel<NetworkStatus>();
const pageShow = new Channel<void>();
const pageHide = new Channel<void>();
/** Never emitted by a test: `useLoad` runs once, on mount. */
const pageLoad = new Channel<void>();
const events = new Map<string, Set<(...args: unknown[]) => void>>();
let networkType = 'wifi';
const storageMap = new Map<string, unknown>();

/** What `Taro.request` answers; a test replaces it (`taroFake.onRequest = …`). */
export type RequestHandler = (option: {
  url: string;
  method: string;
  header: Record<string, string>;
  data?: string | undefined;
}) => { statusCode: number; data: unknown } | Promise<{ statusCode: number; data: unknown }>;

const unhandledRequest: RequestHandler = (option) => {
  throw new Error(`taro-fake: no request handler for ${option.method} ${option.url}`);
};
const DEFAULT_LOGIN_CODE = 'fake-login-code';

export interface RecordedCall {
  api: string;
  args: unknown;
}

/** The test-side controls. */
export const taroFake = {
  calls: [] as RecordedCall[],
  /** `Taro.login()` answers `{ code: loginCode }`. */
  loginCode: DEFAULT_LOGIN_CODE,
  onRequest: unhandledRequest,
  /** `Taro.requestPayment()` resolves, or rejects with this `errMsg`. */
  paymentError: null as string | null,
  /** `useRouter().params`. */
  routerParams: {} as Record<string, string>,
  /** What a tap on `<Button openType="getPhoneNumber">` reports. */
  phoneNumberDetail: { code: 'fake-phone-code', errMsg: 'getPhoneNumber:ok' } as {
    code?: string;
    errMsg: string;
  },
  storage: storageMap,
  showApp: () => appShow.emit(undefined),
  hideApp: () => appHide.emit(undefined),
  setNetwork(isConnected: boolean, type = isConnected ? 'wifi' : 'none') {
    networkType = type;
    network.emit({ isConnected, networkType: type });
  },
  /** Every mounted component's `useDidShow` runs, as when its page comes back. */
  showPage: () => pageShow.emit(undefined),
  hidePage: () => pageHide.emit(undefined),
  listenerCounts: () => ({ appShow: appShow.size, appHide: appHide.size, network: network.size }),
  reset() {
    this.calls = [];
    this.loginCode = DEFAULT_LOGIN_CODE;
    this.onRequest = unhandledRequest;
    this.paymentError = null;
    this.routerParams = {};
    this.phoneNumberDetail = { code: 'fake-phone-code', errMsg: 'getPhoneNumber:ok' };
    storageMap.clear();
    networkType = 'wifi';
    for (const channel of [appShow, appHide, network, pageShow, pageHide, pageLoad])
      channel.clear();
    events.clear();
  },
};

function record<T>(api: string, args: unknown, result: T): Promise<T> {
  taroFake.calls.push({ api, args });
  return Promise.resolve(result);
}

function usePageLifecycle(channel: Channel<void>, callback: () => void, runOnMount: boolean) {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  useEffect(() => {
    const listener = () => latest.current();
    channel.on(listener);
    // A page's first onShow follows its onLoad.
    if (runOnMount) listener();
    return () => channel.off(listener);
  }, [channel, runOnMount]);
}

export function useDidShow(callback: () => void): void {
  usePageLifecycle(pageShow, callback, true);
}

export function useDidHide(callback: () => void): void {
  usePageLifecycle(pageHide, callback, false);
}

export function useLoad(callback: () => void): void {
  usePageLifecycle(pageLoad, callback, true);
}

export function useLaunch(callback: () => void): void {
  usePageLifecycle(pageLoad, callback, true);
}

export function useRouter() {
  return { path: '/pages/test/index', params: taroFake.routerParams };
}

export const eventCenter = {
  on(name: string, handler: (...args: unknown[]) => void) {
    const set = events.get(name) ?? new Set();
    set.add(handler);
    events.set(name, set);
  },
  off(name: string, handler?: (...args: unknown[]) => void) {
    if (handler) events.get(name)?.delete(handler);
    else events.delete(name);
  },
  trigger(name: string, ...args: unknown[]) {
    for (const handler of events.get(name) ?? []) handler(...args);
  },
};

export function getCurrentInstance() {
  return { router: { path: '/pages/test/index', params: {} }, page: null };
}

export function nextTick(callback: () => void): void {
  void Promise.resolve().then(callback);
}

const Taro = {
  onAppShow: appShow.on,
  offAppShow: appShow.off,
  onAppHide: appHide.on,
  offAppHide: appHide.off,
  onNetworkStatusChange: network.on,
  offNetworkStatusChange: network.off,
  getNetworkType: () => record('getNetworkType', undefined, { networkType }),
  setTabBarStyle: (args: unknown) => record('setTabBarStyle', args, {}),
  setTabBarBadge: (args: unknown) => record('setTabBarBadge', args, {}),
  removeTabBarBadge: (args: unknown) => record('removeTabBarBadge', args, {}),
  navigateTo: (args: unknown) => record('navigateTo', args, {}),
  redirectTo: (args: unknown) => record('redirectTo', args, {}),
  login: () => record('login', undefined, { code: taroFake.loginCode, errMsg: 'login:ok' }),
  requestPayment(args: unknown) {
    taroFake.calls.push({ api: 'requestPayment', args });
    const errMsg = taroFake.paymentError;
    return errMsg === null
      ? Promise.resolve({ errMsg: 'requestPayment:ok' })
      : Promise.reject(Object.assign(new Error(errMsg), { errMsg }));
  },
  request(option: Parameters<RequestHandler>[0]) {
    taroFake.calls.push({ api: 'request', args: option });
    return Promise.resolve().then(() => taroFake.onRequest(option));
  },
  getStorageSync: (key: string): unknown => storageMap.get(key) ?? '',
  setStorageSync: (key: string, value: unknown) => void storageMap.set(key, value),
  removeStorageSync: (key: string) => void storageMap.delete(key),
  showToast: (args: unknown) => record('showToast', args, {}),
  eventCenter,
  getCurrentInstance,
  nextTick,
  useDidShow,
  useDidHide,
  useLoad,
  useLaunch,
  useRouter,
};

export default Taro;
