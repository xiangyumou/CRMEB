import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NewAgreement, NewCity, NewExpressCompany } from '../schema/reference';
import type { NewNotificationTemplate } from '../schema/notification';

/**
 * The reference rows the seed inserts.
 *
 * Cities and courier companies come from `seed-data/*.json`, produced by
 * `scripts/extract-legacy-seed.mjs` from the legacy install dump. Agreements
 * and notification templates are seeded as **shells**: the code and the title
 * are the contract the application relies on, the body is installation-specific
 * and arrives with the ETL or is typed by an operator.
 */

const seedDataDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../seed-data');

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(`${seedDataDir}/${name}`, 'utf8')) as T;
}

export async function loadCities(): Promise<NewCity[]> {
  return readJson<NewCity[]>('cities.json');
}

export async function loadExpressCompanies(): Promise<NewExpressCompany[]> {
  return readJson<NewExpressCompany[]>('express-companies.json');
}

/**
 * Legal texts. Legacy `eb_agreement` types 1 (付费会员协议), 2 (代理商规则),
 * 6 (积分协议) and 8 (分销说明) are not here — they described retired features.
 */
export const agreementShells: NewAgreement[] = [
  { code: 'user_service', title: '用户协议', sortOrder: 10 },
  { code: 'privacy_policy', title: '隐私协议', sortOrder: 20 },
  { code: 'account_cancellation', title: '注销协议', sortOrder: 30 },
  { code: 'about_us', title: '关于我们', sortOrder: 40 },
];

/**
 * Notification template keys, renamed from the legacy `mark` values to read as
 * English event names. The legacy key each one replaces is in the comment; the
 * mapping is repeated in `docs/SCHEMA.md` for the ETL.
 *
 * `revenue_received` (收益到账) is absent: it belonged to the brokerage system.
 */
export const notificationTemplateShells: NewNotificationTemplate[] = [
  // verify_code
  { code: 'sms_verify_code', name: '短信验证码', audience: 'user', variables: ['code'] },
  // order_pay_success
  {
    code: 'order_paid',
    name: '支付成功提醒',
    audience: 'user',
    variables: ['orderNo', 'amount', 'productName'],
  },
  // order_postage_success
  {
    code: 'order_shipped',
    name: '发货提醒',
    audience: 'user',
    variables: ['orderNo', 'expressName', 'trackingNo'],
  },
  // order_deliver_success
  {
    code: 'order_delivered_by_merchant',
    name: '送货提醒',
    audience: 'user',
    variables: ['orderNo', 'courierName', 'courierPhone'],
  },
  // order_take
  { code: 'order_received', name: '确认收货提醒', audience: 'user', variables: ['orderNo'] },
  // order_refund
  {
    code: 'order_refund_succeeded',
    name: '退款成功提醒',
    audience: 'user',
    variables: ['orderNo', 'amount'],
  },
  // send_order_refund_no_status
  {
    code: 'order_refund_failed',
    name: '退款失败提醒',
    audience: 'user',
    variables: ['orderNo', 'reason'],
  },
  // price_revision
  {
    code: 'order_price_revised',
    name: '改价提醒',
    audience: 'user',
    variables: ['orderNo', 'amount'],
  },
  // order_pay_false
  {
    code: 'order_unpaid_reminder',
    name: '未付款提醒',
    audience: 'user',
    variables: ['orderNo', 'amount'],
  },
  // open_pink_success
  { code: 'groupbuy_created', name: '开团成功提醒', audience: 'user', variables: ['orderNo'] },
  // can_pink_success
  { code: 'groupbuy_joined', name: '参团成功提醒', audience: 'user', variables: ['orderNo'] },
  // order_user_groups_success
  {
    code: 'groupbuy_succeeded',
    name: '拼团成功提醒',
    audience: 'user',
    variables: ['orderNo', 'productName'],
  },
  // send_order_pink_fial
  { code: 'groupbuy_failed', name: '拼团失败提醒', audience: 'user', variables: ['orderNo'] },
  // send_order_pink_clone
  { code: 'groupbuy_cancelled', name: '取消拼团提醒', audience: 'user', variables: ['orderNo'] },
  // admin_pay_success_code
  {
    code: 'admin_order_paid',
    name: '用户下单提醒',
    audience: 'admin',
    variables: ['orderNo', 'amount'],
  },
  // send_admin_confirm_take_over
  { code: 'admin_order_received', name: '用户收货提醒', audience: 'admin', variables: ['orderNo'] },
  // send_order_apply_refund
  {
    code: 'admin_refund_applied',
    name: '用户申请退款提醒',
    audience: 'admin',
    variables: ['orderNo', 'amount'],
  },
];
