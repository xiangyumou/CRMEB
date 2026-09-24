import Taro from '@tarojs/taro';
import { create } from 'zustand';

/**
 * Privacy authorisation (C04). The single source of truth for which private-info APIs the shop
 * calls: the privacy guide on the WeChat platform must declare exactly these, and `pnpm guards`
 * ([privacy]) checks that every one the platform calls is listed here.
 */
export const PRIVACY_APIS = [
  'chooseAvatar',
  'getPhoneNumber',
  'chooseAddress',
  'chooseInvoiceTitle',
  'chooseMedia',
  'saveImageToPhotosAlbum',
  'setClipboardData',
] as const;

export type PrivacyApi = (typeof PRIVACY_APIS)[number];

/** What each API collects and why, as the privacy guide words it (and the sheet repeats). */
export const PRIVACY_PURPOSES: Readonly<Record<PrivacyApi, { item: string; purpose: string }>> = {
  chooseAvatar: { item: '收集你的昵称、头像', purpose: '设置个人资料' },
  getPhoneNumber: { item: '收集你的手机号', purpose: '登录和绑定手机号' },
  chooseAddress: { item: '收集你的通讯地址', purpose: '快速填写收货地址' },
  chooseInvoiceTitle: { item: '收集你的发票信息', purpose: '快速填写发票抬头' },
  chooseMedia: { item: '收集你选中的照片或视频信息', purpose: '上传图片' },
  saveImageToPhotosAlbum: { item: '使用你的相册（仅写入）权限', purpose: '保存海报' },
  setClipboardData: { item: '使用你的剪切板', purpose: '复制内容' },
};

/** The agree button's id: `resolve({ event: 'agree', buttonId })` must name the tapped button. */
export const PRIVACY_AGREE_BUTTON_ID = 'privacy-agree';

/** The `resolve` WeChat hands the listener. */
export type PrivacyResolve = Parameters<Parameters<typeof Taro.onNeedPrivacyAuthorization>[0]>[0];

interface PrivacyPromptState {
  open: boolean;
  /** What asked (an API name, when WeChat says), for the sheet's 「为了…」 line. */
  purpose: string | null;
}

/** Whether the global privacy sheet is showing; `PrivacySheet` renders from this. */
export const usePrivacyPrompt = create<PrivacyPromptState>()(() => ({
  open: false,
  purpose: null,
}));

/** Every `resolve` WeChat handed us since the sheet opened; each is called exactly once. */
let pending: PrivacyResolve[] = [];
let installed = false;

function purposeOf(referrer: string | undefined): string | null {
  const api = PRIVACY_APIS.find((name) => referrer?.includes(name));
  return api ? PRIVACY_PURPOSES[api].purpose : null;
}

/**
 * The `onNeedPrivacyAuthorization` listener. A private API called before the shopper agreed is
 * held by WeChat until we resolve; the sheet asks. A second call while the sheet is up joins the
 * first: one sheet, and each call's `resolve` runs once. Exported for the H5 "模拟小程序"
 * (`h5-mp-emulation.tsx`), which raises it the way WeChat does; nothing else calls it.
 */
export function needPrivacyAuthorization(
  resolve: PrivacyResolve,
  eventInfo?: { referrer?: string } | undefined,
): void {
  pending.push(resolve);
  if (usePrivacyPrompt.getState().open) return;
  usePrivacyPrompt.setState({ open: true, purpose: purposeOf(eventInfo?.referrer) });
  resolve({ event: 'exposureAuthorization' });
}

/** Registers the one `onNeedPrivacyAuthorization` listener (at launch). */
export function installPrivacyHandler(): void {
  if (installed) return;
  installed = true;
  // C14: older base libraries have no such API; there the platform shows its own dialog.
  if (typeof Taro.onNeedPrivacyAuthorization !== 'function') return;
  if (typeof Taro.canIUse === 'function' && !Taro.canIUse('onNeedPrivacyAuthorization')) return;
  Taro.onNeedPrivacyAuthorization(needPrivacyAuthorization);
}

function settle(option: Parameters<PrivacyResolve>[0]): void {
  const resolvers = pending;
  pending = [];
  usePrivacyPrompt.setState({ open: false, purpose: null });
  for (const resolve of resolvers) resolve(option);
}

/** The agree button was tapped (it is `open-type="agreePrivacyAuthorization"`). */
export function agreePrivacy(): void {
  settle({ event: 'agree', buttonId: PRIVACY_AGREE_BUTTON_ID });
}

/**
 * The shopper declined. Only the feature that asked fails (its API rejects with "privacy
 * permission is not authorized"); browsing goes on (C04, 运营规范 15.1.3).
 */
export function disagreePrivacy(): void {
  settle({ event: 'disagree' });
}

/** Opens the platform-hosted privacy guide. */
export function openPrivacyContract(): void {
  if (typeof Taro.openPrivacyContract !== 'function') return;
  Taro.openPrivacyContract({});
}

/** Whether an API error is WeChat refusing for want of privacy consent. */
export function isPrivacyRefusal(error: unknown): boolean {
  const message =
    typeof error === 'object' && error !== null && 'errMsg' in error
      ? String((error as { errMsg: unknown }).errMsg)
      : String(error);
  return /privacy|errno.?(104|112)/i.test(message);
}

/** Tests only. */
export function resetPrivacyForTest(): void {
  pending = [];
  installed = false;
  usePrivacyPrompt.setState({ open: false, purpose: null });
}
