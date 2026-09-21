# Stream E1 — Users and storefront login

**Worktree** `../CRMEB-wt/ws-e1` · **Branch** `rewrite/ws-e1-user` · **Domains** `user`, `auth/storefront`, `sms` · reference-map section "E1 — User & auth"

## Scope
Storefront auth: SMS-code login/registration, password login, password reset by SMS, WeChat mini-program login (`code2session`, phone-number binding), WeChat OA OAuth login (code exchange), bind/rebind phone, logout, logout-everywhere. Sessions are P0-A's `UserSessionService` (opaque bearer, sha256 in `user_sessions`, `passwordVersion`); register the real `UserLookup`. Any password or status change bumps `users.password_version`. The WeChat HTTP calls go through stream C's `wechat/core` client (code against its interface + the fake gateway in `@shop/testing` until it lands); identities live in `wechat_identities`.

SMS: provider port with an Aliyun implementation and a fake; typed config group `sms`; send-code endpoint with per-phone and per-IP rate limits (kernel rate limiter) and slider-captcha hook; codes stored in Redis, **verified with an atomic `GETDEL` plus an attempt counter** so a code works once and guessing is bounded.

Profile: get/update profile, avatar (through `storage`'s index), addresses CRUD with a single default (partial unique index exists), account cancellation request → admin review (approve anonymises and revokes sessions; never hard-delete rows that orders reference).

Admin: user list with filters (keyword, group, label, status, register source, time), detail with tabs (orders, coupons, addresses — read through other domains' indexes/contracts), edit, enable/disable, reset password, groups CRUD, labels + label categories CRUD, batch set group/labels, grant coupon (through coupon's index), cancellation requests review. Call `coupon.grantNewUser` inside the registration transaction.

ETL mapper: the one kept user, addresses, groups, labels. bcrypt hashes carry over; 32-hex MD5 hashes get `password_algo = 'md5_legacy'` and are upgraded on first successful login (compare in constant time).

## Invariants to prove
Rows under "Registration and notifications" and "Authorization" that concern users. Tests (mandatory): SMS code cannot be replayed (two concurrent verifications → one success); password change revokes every session; disabled user's live token is rejected; login throttling counts account+IP and account-only windows separately (900 s sliding window); case-insensitive account uniqueness; concurrent registration of one phone → one user.

## Fix, don't port
- Storefront tokens not bound to the password (old JWT) → hashed sessions with `passwordVersion`.
- SMS code replay → `GETDEL`.
- Two auth generations (v1 `mp_auth`, v2 `auth_*`) → one.
- Retired profile fields (level, promoter, balance, points) do not exist; do not add them.

## Out of scope
Admin login and RBAC (P0-A / F1), WeChat OA menus/replies/templates (E2), member levels, distribution, sign-in, balance.
