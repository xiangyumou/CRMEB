import { emulatedUser } from './h5-mp-emulation';
import {
  fromWechatInvoiceTitle,
  type ChosenInvoiceTitle,
  type WechatInvoiceTitle,
} from './invoice-title-map';
import { PlatformUnsupportedError } from './types';

/** 模拟小程序's default, as WeChat would hand it over. */
const DEFAULT_TITLE: WechatInvoiceTitle = {
  type: '0',
  title: '广州某某科技有限公司',
  taxNumber: '91440101MA5XXXXX0A',
  companyAddress: '',
  telephone: '',
  bankName: '',
  bankAccount: '',
};

/**
 * H5 builds (Taro resolves this over `invoice-title.ts`): 模拟小程序 answers with the harness's
 * `invoiceTitle` (`null` = the shopper cancels) or a fixed company title; the H5 preview has no
 * WeChat title book.
 */
export function chooseInvoiceTitle(): Promise<ChosenInvoiceTitle | null> {
  if (process.env.TARO_APP_PLATFORM_EMULATION !== 'mp') {
    return Promise.reject(new PlatformUnsupportedError('从微信导入发票抬头', 'h5-preview'));
  }
  const { invoiceTitle } = emulatedUser();
  const raw = invoiceTitle === undefined ? DEFAULT_TITLE : invoiceTitle;
  return Promise.resolve(raw ? fromWechatInvoiceTitle(raw) : null);
}
