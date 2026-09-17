// +----------------------------------------------------------------------
// | CRMEB [ CRMEB赋能开发者，助力企业发展 ]
// +----------------------------------------------------------------------
// | Copyright (c) 2016~2023 https://www.crmeb.com All rights reserved.
// +----------------------------------------------------------------------
// | Licensed CRMEB并不是自由软件，未经许可不能去掉CRMEB相关版权
// +----------------------------------------------------------------------
// | Author: CRMEB Team <admin@crmeb.com>
// +----------------------------------------------------------------------

import request from '@/libs/request';

/**
 * @description 财务管理 -- 资金流水统计
 * @param {Number} param data {Number} 请求参数data
 */
export function getFlowList(data) {
  return request({
    url: `statistic/flow/get_list`,
    method: 'get',
    params: data,
  });
}
/**
 * @description 资金流水 -- 备注
 * @param {Number} param id {Number} 提现申请id
 */
export function setMarks(id, data) {
  return request({
    url: `statistic/flow/set_mark/${id}`,
    method: 'post',
    data,
  });
}
