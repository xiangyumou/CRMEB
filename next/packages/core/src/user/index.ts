import { registerUserLookup } from '../auth/user-lookup';
import * as repo from './user.repo';
import { wechatIdentityAdapter } from './wechat-identity.adapter';
import { registerWechatIdentityPort } from './wechat-identity.port';
import './storefront-auth.config';

/**
 * The `user` domain's public surface: storefront customers, their addresses,
 * their sign-in, and the operator screens behind them.
 *
 * | Caller | Entry point |
 * | --- | --- |
 * | `GET/PUT /api/v1/profile` | `getProfile` / `updateProfile` |
 * | `/api/v1/addresses…` | `addressList` / `defaultAddress` / `addressDetail` / `addressCreate` / `addressUpdate` / `addressDelete` / `addressSetDefault` |
 * | `/api/v1/account-cancellations…` | `requestCancellation` / `currentCancellation` / `withdrawCancellation` |
 * | `POST /api/v1/auth/sms-codes` | `sendSmsCode` |
 * | `POST /api/v1/auth/sessions/*` | `passwordLogin` / `smsLogin` / `miniLogin` / `miniPhoneLogin` / `oaLogin` / `oaPhoneLogin` |
 * | `DELETE /api/v1/auth/sessions…` | `logout` / `logoutEverywhere` |
 * | `POST /api/v1/auth/registrations`, `…/password-resets`, `PUT …/password` | `register` / `resetPassword` / `changePassword` |
 * | `POST/PUT /api/v1/auth/phone` | `bindPhone` / `changePhone` |
 * | `GET /api/v1/auth/wechat-oa/authorize-url` | `oaAuthorizeUrl` |
 * | `POST /api/v1/visits` | `recordVisit` |
 * | `/admin-api/users…` | `adminList` / `adminDetail` / `adminUpdate` / `adminSetStatus` / `adminResetPassword` / `adminAddressList` / `adminBatchSetGroups` / `adminBatchSetLabels` |
 * | `/admin-api/user-groups…`, `/admin-api/user-labels…`, `/admin-api/user-label-categories…` | the taxonomy CRUD below |
 * | `/api/v1/staff/users…`, `/api/v1/staff/user-groups` | `staffList` / `staffDetail` / `staffGroupList` / `staffSetGroup` / `staffLabelList` / `staffSetLabels` |
 * | `/admin-api/user-cancellations…` | `adminCancellationList` / `adminApproveCancellation` / `adminRejectCancellation` / `adminRemarkCancellation` |
 *
 * **What importing this module registers**, through `registerUserDomain()`
 * (the idempotent shape `@shop/core/domains` looks for):
 *
 * 1. the `storefront-auth` config group, so the generic settings screen can
 *    list it (a plain import side effect);
 * 2. `registerUserLookup` — the real implementation of the auth domain's
 *    user-lookup seam. Until this runs, `UserSessionService.resolve` fails
 *    closed and *every* storefront session is rejected — which is the safe
 *    direction;
 * 3. the `WechatIdentityPort` over the `wechat` domain's client
 *    (`wechat-identity.adapter.ts`). A test that wants the fake calls
 *    `registerWechatIdentityPort(fakeWechatIdentityPort())` after this.
 *
 * **What other domains need from here.**
 *
 * | Need | Reach for |
 * | --- | --- |
 * | the signed-in shopper's profile | `getProfile(ctx)` |
 * | the address an order ships to | `defaultAddress(ctx)` / `addressDetail(ctx, { id })` |
 * | a different WeChat identity source (tests) | `registerWechatIdentityPort(impl)` |
 * | a different SMS provider | `registerSmsSender(impl)` from `@shop/core/sms` |
 *
 * Nothing else reaches `user.repo.ts`; it is the only file in the system that
 * may touch `users`, and a second one would make "who can disable an account"
 * unanswerable.
 */

export function registerUserDomain(): void {
  registerUserLookup({
    findAuthState: (db, userId) => repo.findAuthState(db, userId),
  });
  registerWechatIdentityPort(wechatIdentityAdapter);
}

registerUserDomain();

// ---------------------------------------------------------------------------
// storefront
// ---------------------------------------------------------------------------

export {
  addressCreate,
  addressDelete,
  addressDetail,
  addressList,
  addressSetDefault,
  addressUpdate,
  currentCancellation,
  defaultAddress,
  getProfile,
  requestCancellation,
  updateProfile,
  withdrawCancellation,
} from './user.service';

export {
  bindPhone,
  bindPhoneFromMini,
  changePassword,
  changePhone,
  isAllowedRedirect,
  logout,
  logoutEverywhere,
  miniLogin,
  miniPhoneLogin,
  oaAuthorizeUrl,
  oaLogin,
  oaPhoneLogin,
  passwordLogin,
  register,
  resetPassword,
  sendSmsCode,
  smsLogin,
  type RequestMeta,
} from './storefront-auth.service';

export { recordVisit } from './user.visit.service';

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------

export {
  adminAddressList,
  adminApproveCancellation,
  adminBatchSetGroups,
  adminBatchSetLabels,
  adminCancellationList,
  adminDetail,
  adminList,
  adminRejectCancellation,
  adminRemarkCancellation,
  adminResetPassword,
  adminSetStatus,
  adminUpdate,
  groupCreate,
  groupDelete,
  groupList,
  groupUpdate,
  labelCategoryCreate,
  labelCategoryDelete,
  labelCategoryList,
  labelCategoryUpdate,
  labelCreate,
  labelDelete,
  labelList,
  labelUpdate,
} from './user-admin.service';

// ---------------------------------------------------------------------------
// staff — 商家管理 → 用户
// ---------------------------------------------------------------------------

export {
  staffDetail,
  staffGroupList,
  staffLabelList,
  staffList,
  staffSetGroup,
  staffSetLabels,
} from './user-staff.service';

// ---------------------------------------------------------------------------
// seams
// ---------------------------------------------------------------------------

export { storefrontAuthConfig, type StorefrontAuthConfig } from './storefront-auth.config';
export { userPermissions } from './permissions';

export {
  fakeWechatIdentityPort,
  getWechatIdentityPort,
  registerWechatIdentityPort,
  resetWechatIdentityPort,
  type FakeWechatIdentityPort,
  type WechatIdentityPort,
  type WechatMiniSession,
  type WechatOaUser,
  type WechatPhoneNumber,
} from './wechat-identity.port';

export {
  fakeUserOrderStatsPort,
  getUserOrderStatsPort,
  registerUserOrderStatsPort,
  resetUserOrderStatsPort,
  type FakeUserOrderStatsPort,
  type UserOrderStats,
  type UserOrderStatsPort,
} from './user-order-stats.port';

export { maskPhone } from './user.rules';
