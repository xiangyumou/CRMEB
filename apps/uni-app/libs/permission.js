import Cache from '@/utils/cache';

/**
 * 判断传入的 key 是否在数组 arr 中存在
 * @param {string} key - 待判断的字符串
 * @returns {boolean} - 返回布尔值，表示是否有权限
 */
function ActivePermission(key) {
	// 只有 combination（拼团）是本商城保留的活动模块
	let arr = Cache.get('BASIC_CONFIG').site_func || ['combination'];
	let index = arr.indexOf(key); // 获取 key 在数组中的索引
	if (index > -1) {
		// 如果索引大于 -1，说明 key 存在于数组中
		return true; // 有权限
	} else {
		return false; // 无权限
	}
}


export default ActivePermission;