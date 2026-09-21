import { z } from 'zod';
import { id } from '../_conventions/common';
import { defineRoute } from '../_conventions/route';
import {
  adminUserCouponListQuery,
  couponGrantBody,
  couponGrantResult,
  couponTemplateDetail,
  couponTemplateDetailExample,
  couponTemplateExample,
  couponTemplateForm,
  couponTemplateListQuery,
  couponTemplateStatusBody,
  pagedAdminUserCoupons,
  pagedCouponTemplates,
  userCouponExample,
} from './schemas';

/**
 * Admin coupon routes, `/admin-api/coupons` and `/admin-api/user-coupons`.
 *
 * Two things to copy from here:
 *
 * 1. **The directory is the URL.** CONVENTIONS' path table says
 *    `app/admin-api/<domain>/**`, but Next's App Router derives the URL from
 *    the directory, and CONVENTIONS also says paths are *plural nouns*. The URL
 *    wins: the files live in `app/admin-api/coupons/` and
 *    `app/admin-api/user-coupons/`. See `docs/rewrite/cr/CR-1-golden.md`.
 * 2. **Not-CRUD actions are POSTed sub-resources**, never a `?action=` query or
 *    a PATCH with a magic field: `POST /admin-api/coupons/:id/status`,
 *    `POST /admin-api/coupons/:id/grants`.
 */

const templateParams = z.object({ id });

export const couponAdminList = defineRoute({
  id: 'coupon.adminList',
  method: 'GET',
  path: '/admin-api/coupons',
  auth: 'admin',
  permission: 'coupon:template:read',
  summary: '优惠券列表',
  tags: ['coupon'],
  query: couponTemplateListQuery,
  response: pagedCouponTemplates,
  examples: [
    {
      name: 'first-page',
      query: { page: 1, pageSize: 20 },
      response: { items: [couponTemplateExample], total: 1, page: 1, pageSize: 20 },
    },
    {
      name: 'empty',
      query: { page: 1, pageSize: 20, status: 'disabled' },
      response: { items: [], total: 0, page: 1, pageSize: 20 },
    },
  ],
});

export const couponAdminDetail = defineRoute({
  id: 'coupon.adminDetail',
  method: 'GET',
  path: '/admin-api/coupons/:id',
  auth: 'admin',
  permission: 'coupon:template:read',
  summary: '优惠券详情',
  tags: ['coupon'],
  params: templateParams,
  response: couponTemplateDetail,
  errors: ['COUPON_TEMPLATE_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: couponTemplateDetailExample }],
});

export const couponAdminCreate = defineRoute({
  id: 'coupon.adminCreate',
  method: 'POST',
  path: '/admin-api/coupons',
  auth: 'admin',
  permission: 'coupon:template:write',
  summary: '新建优惠券',
  tags: ['coupon'],
  body: couponTemplateForm,
  response: couponTemplateDetail,
  status: 201,
  examples: [
    {
      name: 'fixed-window',
      body: {
        name: '满 100 减 10',
        scope: 'all_products',
        claimMode: 'manual',
        status: 'active',
        discountAmount: '10.00',
        minSpend: '100.00',
        validityMode: 'fixed_window',
        validFrom: '2026-01-01T00:00:00+08:00',
        validTo: '2026-12-31T23:59:59+08:00',
        claimFrom: '2026-01-01T00:00:00+08:00',
        claimTo: '2026-06-30T23:59:59+08:00',
        isUnlimitedSupply: false,
        totalCount: 1000,
        perUserLimit: 1,
      },
      response: couponTemplateDetailExample,
    },
    {
      name: 'days-after-claim',
      body: {
        name: '新人专享 5 元券',
        scope: 'categories',
        claimMode: 'new_user',
        discountAmount: '5.00',
        validityMode: 'days_after_claim',
        validDays: 30,
        isUnlimitedSupply: true,
        categoryIds: ['7'],
      },
      response: {
        ...couponTemplateDetailExample,
        id: '2',
        name: '新人专享 5 元券',
        scope: 'categories',
        claimMode: 'new_user',
        status: 'draft',
        discountAmount: '5.00',
        minSpend: '0.00',
        validityMode: 'days_after_claim',
        validFrom: null,
        validTo: null,
        validDays: 30,
        claimFrom: null,
        claimTo: null,
        isUnlimitedSupply: true,
        totalCount: null,
        remainingCount: null,
        issuedCount: 0,
        perUserLimit: null,
        categoryIds: ['7'],
      },
    },
  ],
});

export const couponAdminUpdate = defineRoute({
  id: 'coupon.adminUpdate',
  method: 'PUT',
  path: '/admin-api/coupons/:id',
  auth: 'admin',
  permission: 'coupon:template:write',
  summary: '编辑优惠券',
  tags: ['coupon'],
  params: templateParams,
  body: couponTemplateForm,
  response: couponTemplateDetail,
  errors: ['COUPON_TEMPLATE_NOT_FOUND'],
  examples: [
    {
      name: 'rename',
      params: { id: '1' },
      body: {
        name: '满 100 减 12',
        scope: 'all_products',
        claimMode: 'manual',
        status: 'active',
        discountAmount: '12.00',
        minSpend: '100.00',
        validityMode: 'fixed_window',
        validFrom: '2026-01-01T00:00:00+08:00',
        validTo: '2026-12-31T23:59:59+08:00',
        isUnlimitedSupply: false,
        totalCount: 1000,
        perUserLimit: 1,
      },
      response: {
        ...couponTemplateDetailExample,
        name: '满 100 减 12',
        discountAmount: '12.00',
        claimFrom: null,
        claimTo: null,
      },
    },
  ],
});

export const couponAdminSetStatus = defineRoute({
  id: 'coupon.adminSetStatus',
  method: 'POST',
  path: '/admin-api/coupons/:id/status',
  auth: 'admin',
  permission: 'coupon:template:write',
  summary: '启用/停用优惠券',
  tags: ['coupon'],
  params: templateParams,
  body: couponTemplateStatusBody,
  response: couponTemplateDetail,
  errors: ['COUPON_TEMPLATE_NOT_FOUND'],
  examples: [
    {
      name: 'disable',
      params: { id: '1' },
      body: { status: 'disabled' },
      response: { ...couponTemplateDetailExample, status: 'disabled' },
    },
  ],
});

export const couponAdminDelete = defineRoute({
  id: 'coupon.adminDelete',
  method: 'DELETE',
  path: '/admin-api/coupons/:id',
  auth: 'admin',
  permission: 'coupon:template:delete',
  summary: '删除优惠券',
  tags: ['coupon'],
  params: templateParams,
  response: z.void(),
  status: 204,
  errors: ['COUPON_TEMPLATE_NOT_FOUND'],
  examples: [{ name: 'ok', params: { id: '1' }, response: undefined }],
});

export const couponAdminGrant = defineRoute({
  id: 'coupon.adminGrant',
  method: 'POST',
  path: '/admin-api/coupons/:id/grants',
  auth: 'admin',
  permission: 'coupon:grant:write',
  summary: '发放优惠券给指定用户',
  tags: ['coupon'],
  params: templateParams,
  body: couponGrantBody,
  response: couponGrantResult,
  errors: ['COUPON_TEMPLATE_NOT_FOUND', 'COUPON_GRANT_USER_UNKNOWN', 'COUPON_SOLD_OUT'],
  examples: [
    {
      name: 'two-users',
      params: { id: '1' },
      body: { userIds: ['101', '102'] },
      response: { granted: 2, skippedUserIds: [] },
    },
    {
      name: 'one-already-at-limit',
      params: { id: '1' },
      body: { userIds: ['101', '102'] },
      response: { granted: 1, skippedUserIds: ['102'] },
    },
  ],
});

export const couponAdminUserCouponList = defineRoute({
  id: 'coupon.adminUserCouponList',
  method: 'GET',
  path: '/admin-api/user-coupons',
  auth: 'admin',
  permission: 'coupon:user-coupon:read',
  summary: '已领取优惠券列表',
  tags: ['coupon'],
  query: adminUserCouponListQuery,
  response: pagedAdminUserCoupons,
  examples: [
    {
      name: 'by-template',
      query: { page: 1, pageSize: 20, templateId: '1' },
      response: {
        items: [
          {
            ...userCouponExample,
            userId: '101',
            userNickname: '小明',
            sourceOrderId: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
    },
  ],
});
