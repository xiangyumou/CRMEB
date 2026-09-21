import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  cancellationRequest,
  cancellationRequestExample,
  cancellationRequestForm,
  pagedUserAddresses,
  userAddress,
  userAddressExample,
  userAddressForm,
  userAddressListQuery,
  userProfile,
  userProfileExample,
  userProfileForm,
} from './schemas';

/**
 * The shopper's own account: `/api/v1/profile`, `/api/v1/addresses`,
 * `/api/v1/account-cancellations`.
 *
 * Every route here is scoped to the caller. None of them takes a user id —
 * not as a parameter, not in a body — which is what makes "user A reads user
 * B's address" unrepresentable rather than merely checked for. The legacy
 * `UserAddressServices::address($id)` had no ownership check at all, and
 * `editAddress` had one that was a single `=` typo.
 */

export const userGetProfile = defineRoute({
  id: 'user.getProfile',
  method: 'GET',
  path: '/api/v1/profile',
  auth: 'user',
  summary: '我的资料',
  tags: ['user'],
  response: userProfile,
  errors: ['USER_NOT_FOUND'],
  examples: [{ name: 'ok', response: userProfileExample }],
});

export const userUpdateProfile = defineRoute({
  id: 'user.updateProfile',
  method: 'PUT',
  path: '/api/v1/profile',
  auth: 'user',
  summary: '修改我的资料',
  tags: ['user'],
  body: userProfileForm,
  response: userProfile,
  errors: ['USER_NOT_FOUND'],
  examples: [
    {
      name: 'nickname-and-avatar',
      body: { nickname: '小明', avatarUrl: 'https://cdn.example.com/2026/09/a1b2c3d4.png' },
      response: userProfileExample,
    },
  ],
});

// ---------------------------------------------------------------------------
// addresses
// ---------------------------------------------------------------------------

export const userAddressList = defineRoute({
  id: 'user.addressList',
  method: 'GET',
  path: '/api/v1/addresses',
  auth: 'user',
  summary: '收货地址列表',
  tags: ['user'],
  query: userAddressListQuery,
  response: pagedUserAddresses,
  examples: [
    {
      name: 'ok',
      query: { page: 1, pageSize: 20 },
      response: { items: [userAddressExample], total: 1, page: 1, pageSize: 20 },
    },
  ],
});

/**
 * The default address, or `null`.
 *
 * A separate route rather than a flag on the list because checkout asks for
 * exactly this and nothing else, and paging through 20 addresses to find the
 * one with `isDefault` is what the legacy uni-app did on every cart render.
 */
export const userDefaultAddress = defineRoute({
  id: 'user.defaultAddress',
  method: 'GET',
  path: '/api/v1/addresses/default',
  auth: 'user',
  summary: '默认收货地址',
  tags: ['user'],
  response: z.object({ address: userAddress.nullable() }),
  examples: [
    { name: 'has-one', response: { address: userAddressExample } },
    { name: 'none', response: { address: null } },
  ],
});

export const userAddressDetail = defineRoute({
  id: 'user.addressDetail',
  method: 'GET',
  path: '/api/v1/addresses/:id',
  auth: 'user',
  summary: '收货地址详情',
  tags: ['user'],
  params: z.object({ id }),
  response: userAddress,
  errors: ['USER_ADDRESS_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '5001' }, response: userAddressExample }],
});

export const userAddressCreate = defineRoute({
  id: 'user.addressCreate',
  method: 'POST',
  path: '/api/v1/addresses',
  auth: 'user',
  summary: '新增收货地址',
  tags: ['user'],
  body: userAddressForm,
  response: userAddress,
  status: 201,
  errors: ['USER_ADDRESS_LIMIT_REACHED'],
  examples: [
    {
      name: 'ok',
      body: {
        receiverName: '张三',
        receiverPhone: '13800138000',
        provinceId: '110000',
        cityId: '110100',
        districtId: '110105',
        provinceName: '北京市',
        cityName: '北京市',
        districtName: '朝阳区',
        detail: '建国路 88 号 SOHO 尚都 1201',
        postCode: '100022',
        isDefault: true,
      },
      response: userAddressExample,
    },
  ],
});

export const userAddressUpdate = defineRoute({
  id: 'user.addressUpdate',
  method: 'PUT',
  path: '/api/v1/addresses/:id',
  auth: 'user',
  summary: '编辑收货地址',
  tags: ['user'],
  params: z.object({ id }),
  body: userAddressForm,
  response: userAddress,
  errors: ['USER_ADDRESS_NOT_FOUND'],
  examples: [
    {
      name: 'ok',
      params: { id: '5001' },
      body: {
        receiverName: '张三',
        receiverPhone: '13800138000',
        provinceName: '北京市',
        cityName: '北京市',
        districtName: '朝阳区',
        detail: '建国路 88 号 SOHO 尚都 1801',
        isDefault: true,
      },
      response: { ...userAddressExample, detail: '建国路 88 号 SOHO 尚都 1801' },
    },
  ],
});

export const userAddressDelete = defineRoute({
  id: 'user.addressDelete',
  method: 'DELETE',
  path: '/api/v1/addresses/:id',
  auth: 'user',
  summary: '删除收货地址',
  tags: ['user'],
  params: z.object({ id }),
  response: z.void(),
  status: 204,
  errors: ['USER_ADDRESS_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '5001' }, response: undefined }],
});

/**
 * Make this one the default.
 *
 * A POSTed sub-resource, not `PUT /addresses/:id { isDefault: true }`, because
 * the write touches two rows: the partial unique index
 * `user_addresses_default_uq` refuses a second live default, so the old one is
 * cleared in the same transaction.
 */
export const userAddressSetDefault = defineRoute({
  id: 'user.addressSetDefault',
  method: 'POST',
  path: '/api/v1/addresses/:id/default',
  auth: 'user',
  summary: '设为默认地址',
  tags: ['user'],
  params: z.object({ id }),
  body: z.object({}).default({}),
  response: userAddress,
  errors: ['USER_ADDRESS_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '5001' }, body: {}, response: userAddressExample }],
});

// ---------------------------------------------------------------------------
// account cancellation
// ---------------------------------------------------------------------------

/**
 * File a 注销申请.
 *
 * Two steps, not one. The legacy `SetUserCancel` flipped `is_del = 1` the
 * instant the button was tapped — no confirmation, no review, no way back, and
 * the admin 同意/拒绝 endpoints were empty stubs that returned success. Here the
 * request is a row an operator has to act on, and approval anonymises rather
 * than deletes, because orders, refunds and invoices still point at the id.
 */
export const userRequestCancellation = defineRoute({
  id: 'user.requestCancellation',
  method: 'POST',
  path: '/api/v1/account-cancellations',
  auth: 'user',
  summary: '申请注销账号',
  tags: ['user'],
  body: cancellationRequestForm,
  response: cancellationRequest,
  status: 201,
  errors: ['USER_CANCELLATION_PENDING'],
  examples: [{ name: 'ok', body: { reason: '不再使用了' }, response: cancellationRequestExample }],
});

export const userCurrentCancellation = defineRoute({
  id: 'user.currentCancellation',
  method: 'GET',
  path: '/api/v1/account-cancellations/current',
  auth: 'user',
  summary: '我的注销申请',
  tags: ['user'],
  response: z.object({ request: cancellationRequest.nullable() }),
  examples: [
    { name: 'pending', response: { request: cancellationRequestExample } },
    { name: 'none', response: { request: null } },
  ],
});

export const userWithdrawCancellation = defineRoute({
  id: 'user.withdrawCancellation',
  method: 'DELETE',
  path: '/api/v1/account-cancellations/current',
  auth: 'user',
  summary: '撤回注销申请',
  tags: ['user'],
  response: cancellationRequest,
  errors: ['USER_CANCELLATION_NOT_FOUND', 'USER_CANCELLATION_NOT_PENDING'],
  examples: [
    {
      name: 'ok',
      response: { ...cancellationRequestExample, status: 'withdrawn' },
    },
  ],
});
