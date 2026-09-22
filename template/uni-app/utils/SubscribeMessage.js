// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2024 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------

import {
	SUBSCRIBE_MESSAGE
} from '../config/cache.js';

/**
 * The cached subscribe-template map, as `api/api.js`'s `getTempIds` writes it.
 *
 * Keyed by the contract's four scenes — `order-create`, `order-pay`, `order-ship`,
 * `refund` — where legacy keyed it by an internal template name per notification
 * (`order_pay_success`, `order_take`, `user_extract`, …). One scene now covers every
 * template that moment needs, which is why the helpers below ask for a scene and not
 * for a list of names.
 */
export function auth() {
	let messageTmplIds = uni.getStorageSync(SUBSCRIBE_MESSAGE);
	return messageTmplIds ? JSON.parse(messageTmplIds) : {};
}

/** Every template configured for one moment, or none if the shop configured none. */
function scene(name) {
	let tmplIds = auth();
	let ids = tmplIds[name];
	return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

/**
 * 支付成功后订阅消息：支付成功本身，以及之后的发货通知。
 */
export function openPaySubscribe() {
	return subscribe(scene('order-pay').concat(scene('order-ship')));
}

/**
 * 下单相关订阅消息
 */
export function openOrderSubscribe() {
	return subscribe(scene('order-create'));
}

/**
 * 拼团成功。拼团成团就是下单成功，走同一批模板。
 */
export function openPinkSubscribe() {
	return subscribe(scene('order-create'));
}

/**
 * 订单退款
 */
export function openOrderRefundSubscribe() {
	return subscribe(scene('refund'));
}

/**
 * 调起订阅界面
 * @param array tmplIds 模板 id
 *
 * An empty list is the normal answer for a shop that configured no templates, and
 * `requestSubscribeMessage` with `tmplIds: []` throws — so it resolves without asking.
 * 提现、砍价、充值 subscriptions are gone with the features they announced.
 */
export function subscribe(tmplIds) {
	if (!tmplIds || !tmplIds.length) return Promise.resolve({});
	return new Promise((resolve) => {
		uni.requestSubscribeMessage({
			tmplIds: tmplIds,
			success(res) {
				return resolve(res);
			},
			fail(res) {
				return resolve(res);
			}
		});
	});
}
