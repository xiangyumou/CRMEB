#!/usr/bin/env bash
# Directed mutation check: prove the tests are not vacuous.
#
# For each protection the suite claims to cover, the protection is removed in a
# TEMPORARY COPY of the workspace (never in the working tree), the corresponding
# test is run, and the test MUST fail. A protection whose removal leaves the
# suite green is a protection the tests do not actually exercise.
#
# Usage: bash tests/deployment/mutation-check.sh [SOURCE_ROOT]
set -Eeuo pipefail

root="${1:-$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)}"
work="$(mktemp -d /tmp/crmeb-mutation-XXXXXX)"
image="crmeb-mutation-$$"
project="crmeb-mutation-$$"
passed=0
failed=0
skipped=0

cleanup() {
    docker compose -p "$project" -f "$work/docker/regression/compose.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
    docker rmi -f "$image" >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT INT TERM

# Only the source and the test suite are needed; the image provides the rest.
mkdir -p "$work"
tar -C "$root" --exclude='.git' --exclude='node_modules' --exclude='vendor' -cf - . | tar -C "$work" -xf -

# The frontend artifacts inside the copy are commit-pinned, so the image must be
# built with the revision build.json names (which is the revision the suite was
# last green on), not necessarily the current HEAD of a docs-only change.
revision="$(python3 -c "import json;print(json.load(open('$work/.build/release/build.json'))['gitCommit'])")"
docker build --build-arg VCS_REF="$revision" -t "$image" "$work" >"$work/image-build.log" 2>&1 ||
    { tail -20 "$work/image-build.log" >&2; echo 'could not build the mutation image' >&2; exit 1; }

compose_file="$work/docker/regression/compose.yml"
export CRMEB_TEST_IMAGE="$image"
sed -i "s/^name: .*/name: $project/" "$compose_file"

for volume in runtime uploads; do
    docker volume create "${project}_$volume" >/dev/null
done
docker run --rm --entrypoint sh \
    -v "${project}_runtime:/var/www/crmeb/runtime" \
    -v "${project}_uploads:/var/www/crmeb/public/uploads" \
    "$image" -c 'test -d /var/www/crmeb/runtime/temp' >/dev/null
docker compose -f "$compose_file" up -d mysql redis php-fpm workerman nginx >/dev/null 2>&1 ||
    { echo 'the mutation stack did not start' >&2; exit 1; }

run_test() {
    docker compose -f "$compose_file" run --rm regression \
        php /tests/regression/vendor/bin/phpunit --configuration /tests/regression/phpunit.xml --filter "$1" 2>&1
}

# mutate <label> <path under the copy> <old text file> <new text file> <test filter>
mutate() {
    local label="$1" file="$2" old_file="$3" new_file="$4" filter="$5"
    cp "$work/$file" "$work/mutation-backup.php"
    if ! python3 - "$work/$file" "$old_file" "$new_file" <<'PYEOF'
import sys
path, old_file, new_file = sys.argv[1], sys.argv[2], sys.argv[3]
source = open(path).read()
old = open(old_file).read()
new = open(new_file).read()
if old not in source:
    sys.exit(3)
open(path, 'w').write(source.replace(old, new, 1))
PYEOF
    then
        echo "SKIP - $label: the mutation target is not present (the code changed shape)" >&2
        cp "$work/mutation-backup.php" "$work/$file"
        rm -f "$work/mutation-backup.php"
        skipped=$((skipped + 1))
        return
    fi

    local output status
    set +e
    output="$(run_test "$filter")"
    status=$?
    set -e
    cp "$work/mutation-backup.php" "$work/$file"
    rm -f "$work/mutation-backup.php"

    if [ "$status" -eq 0 ]; then
        echo "FAIL - $label: the suite stayed green without the protection" >&2
        printf '%s\n' "$output" | tail -6 >&2
        failed=$((failed + 1))
    else
        echo "ok - $label: the test fails when the protection is removed"
        passed=$((passed + 1))
    fi
}

# Snippets live in files so the shell never has to quote PHP.
mkdir -p "$work/.mutations"

write_pair() {
    local name="$1" old="$2" new="$3"
    printf '%s' "$old" > "$work/.mutations/$name.old"
    printf '%s' "$new" > "$work/.mutations/$name.new"
}

# 1. The order lock in the second payment-creation transaction: without it, a
#    cancellation can commit while a create is in flight.
write_pair "order_lock" \
"                \$fresh = \$this->dao->getForUpdate((int)\$order['id']);" \
"                \$fresh = \$this->dao->get((int)\$order['id']);"
mutate "payment/cancel order lock" \
    "crmeb/app/services/order/StoreOrderServices.php" \
    "$work/.mutations/order_lock.old" "$work/.mutations/order_lock.new" \
    "PaymentConcurrencyTest::testNoCollectibleGatewayPaymentSurvivesACancelledOrder"

# 2. The attempt immutability check: without it, a changed amount overwrites the
#    recorded attempt.
write_pair "attempt_amount" \
'                    if (bccomp($stored[$field] === '"''"' ? '"'0'"' : $stored[$field], $value === '"''"' ? '"'0'"' : $value, 2) !== 0) {' \
'                    if (false) {'
mutate "attempt context immutability" \
    "crmeb/app/services/order/StoreOrderPaymentAttemptServices.php" \
    "$work/.mutations/attempt_amount.old" "$work/.mutations/attempt_amount.new" \
    "PaymentConcurrencyTest::testPaymentAttemptContextIsImmutable"

# 3. The gateway-confirmed close: without it, the attempt is closed locally.
write_pair "close_task" \
'        if ($result['"'"'state'"'"'] === \app\services\pay\PayTradeServices::STATE_CLOSED) {' \
'        if (true) {'
mutate "gateway-confirmed close" \
    "crmeb/app/services/order/StoreOrderEffectServices.php" \
    "$work/.mutations/close_task.old" "$work/.mutations/close_task.new" \
    "PaymentExceptionTest::testCloseTasksReallyCloseOtherAttemptsAtTheGateway"

# 4. The refund amount freeze: without it, a retry with another amount is not refused.
write_pair "refund_freeze" \
'                if (bccomp($this->normalizeAmount($frozenPrice), $this->normalizeAmount($inputPrice), 2) !== 0) {' \
'                if (false) {'
mutate "refund amount freeze" \
    "crmeb/app/services/order/StoreOrderRefundServices.php" \
    "$work/.mutations/refund_freeze.old" "$work/.mutations/refund_freeze.new" \
    "RefundConcurrencyTest::testARetryWithADifferentAmountIsRefused"

# 5. The conditional coupon decrement: without the guard, the last coupon is
#    handed out twice.
write_pair "coupon_guard" \
"            ->where('remain_count >= ' . \$num)" \
"            ->where('remain_count >= 0)"
mutate "coupon remaining-count guard" \
    "crmeb/app/dao/activity/coupon/StoreCouponIssueDao.php" \
    "$work/.mutations/coupon_guard.old" "$work/.mutations/coupon_guard.new" \
    "OrderBusinessInvariantTest::testTheLastCouponCannotBeClaimedTwice"

# 6. The virtual-card conditional claim: without it, one card reaches two orders.
write_pair "virtual_claim" \
"                ->where('uid', 0)
                ->where('order_id', '')" \
"                ->where('uid', -1)"
mutate "virtual card atomic claim" \
    "crmeb/app/dao/product/sku/StoreProductVirtualDao.php" \
    "$work/.mutations/virtual_claim.old" "$work/.mutations/virtual_claim.new" \
    "FulfillmentAtomicityTest::testTwoOrdersCannotClaimTheSameCard"

# 7. The refund completion generated from the service: without it, the caller's
#    stale value is written.
write_pair "refund_completion" \
"            'refunded_price' => bcadd(\$alreadyRefunded, \$refunded, 2)," \
"            'refunded_price' => \$alreadyRefunded,"
mutate "refund completion from the service" \
    "crmeb/app/services/order/StoreOrderRefundServices.php" \
    "$work/.mutations/refund_completion.old" "$work/.mutations/refund_completion.new" \
    "RefundConcurrencyTest::testTheServiceGeneratesTheLocalCompletionFromTheFrozenRequest"

# 8. The TLS peer verification: without it, a spoofed transport is trusted.
write_pair "tls_peer" \
'        curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, true);' \
'        curl_setopt($curl, CURLOPT_SSL_VERIFYPEER, false);'
mutate "TLS peer verification" \
    "crmeb/crmeb/services/easywechat/v3pay/BaseClient.php" \
    "$work/.mutations/tls_peer.old" "$work/.mutations/tls_peer.new" \
    "PaymentTransportTest::testTransportKeepsPeerAndHostVerificationOn"

# 9. The response signature check: without it, an unverified answer is trusted.
write_pair "response_signature" \
'            if (!$this->instance->v3pay->responseSignatureValid($res)) {' \
'            if (false) {'
mutate "response signature validation" \
    "crmeb/crmeb/services/pay/storage/V3WechatPay.php" \
    "$work/.mutations/response_signature.old" "$work/.mutations/response_signature.new" \
    "PaymentTransportTest::testQueryAndCloseRefuseUnverifiedResponses"

# 10. The cancelled-order branch in the notification path: without it, a payment
#     for a cancelled order is treated as a normal payment.
write_pair "cancelled_branch" \
'            if ((int)($orderInfo->is_cancel ?? 0) === 1) {' \
'            if (false) {'
mutate "cancelled-order payment handling" \
    "crmeb/app/services/pay/PayNotifyServices.php" \
    "$work/.mutations/cancelled_branch.old" "$work/.mutations/cancelled_branch.new" \
    "PaymentExceptionTest::testAPaymentForACancelledOrderBecomesAPersistedException"

# 11. The user refund cancellation state gate: without it, a refund that is
#     already processing, unknown or successful can still be cancelled.
write_pair "refund_cancel_state" \
"            if (!in_array((int)\$row['refund_type'], [1, 2, 4, 5], true)
                || !in_array((int)\$row['refund_state'], [self::REFUND_STATE_SUBMITTED, self::REFUND_STATE_CLOSED], true)) {" \
"            if (false) {"
mutate "user refund cancellation state gate" \
    "crmeb/app/services/order/StoreOrderRefundServices.php" \
    "$work/.mutations/refund_cancel_state.old" "$work/.mutations/refund_cancel_state.new" \
    "RefundConcurrencyTest"

# 12. The order lock the cancellation shares with gateway preparation: without
#     it, a cancel and a refund preparation can interleave.
write_pair "refund_cancel_lock" \
"            \$this->storeOrderServices->getForUpdate(\$rootId);
            \$row = \$this->dao->getForUpdate((int)\$snapshot['id']);" \
"            \$this->storeOrderServices->get(\$rootId);
            \$row = \$this->dao->get((int)\$snapshot['id']);"
mutate "user refund cancellation order lock" \
    "crmeb/app/services/order/StoreOrderRefundServices.php" \
    "$work/.mutations/refund_cancel_lock.old" "$work/.mutations/refund_cancel_lock.new" \
    "RefundConcurrencyTest"

# 13. The scan-upload token comparison: without it, anyone can upload.
write_pair "scan_upload_token" \
"        if (!is_string(\$uploadToken) || \$uploadToken === ''
            || !is_string(\$expectedToken) || \$expectedToken === ''
            || !hash_equals(\$expectedToken, \$uploadToken)) {" \
"        if (false) {"
mutate "scan upload token authorization" \
    "crmeb/app/adminapi/controller/PublicController.php" \
    "$work/.mutations/scan_upload_token.old" "$work/.mutations/scan_upload_token.new" \
    "ScanUploadAuthorizationTest"

# 14. The server-side captcha requirement on admin login: without it, the client
#     decides whether to verify and the endpoint can be brute-forced again.
#     There is deliberately no lockout mutation: behind this deployment's reverse
#     proxy every visitor shares one source address, so a lockout would be a
#     global one. `testManyFailuresNeverRefuseALaterAttemptOutright` guards that.
write_pair "admin_login_captcha" \
"        if (\$guard->captchaRequired((string)\$account, \$ip)) {" \
"        if (false) {"
mutate "admin login server-side captcha requirement" \
    "crmeb/app/adminapi/controller/Login.php" \
    "$work/.mutations/admin_login_captcha.old" "$work/.mutations/admin_login_captcha.new" \
    "AdminLoginThrottleTest"

# 15. 前台登录的账号维度节流：去掉之后 /api/login 又可以被无限次试口令。
write_pair "storefront_login_throttle" \
'        if ($guard->accountFailuresWithin((string)$account, self::LOGIN_COOLDOWN) >= self::LOGIN_FAILURES_BEFORE_COOLDOWN) {' \
'        if (false) {'
mutate "storefront login throttle" \
    "crmeb/app/api/controller/v1/LoginController.php" \
    "$work/.mutations/storefront_login_throttle.old" "$work/.mutations/storefront_login_throttle.new" \
    "StorefrontLoginSecurityTest::testRepeatedFailuresCoolTheAccountDownBeforeTheCredentialIsChecked"

# 16. 口令升级的回读校验：去掉之后，列还没加宽时写进去的 bcrypt 会被静默截断，
#     那个账号从此再也登不进来。
write_pair "password_upgrade_readback" \
'                    if (!UserPassword::verify((string)$password, $stored)) {' \
'                    if (false) {'
mutate "password upgrade read-back" \
    "crmeb/app/services/user/LoginServices.php" \
    "$work/.mutations/password_upgrade_readback.old" "$work/.mutations/password_upgrade_readback.new" \
    "StorefrontLoginSecurityTest::testAnUpgradeIsAbandonedWhenTheColumnCannotHoldABcryptHash"

# 17. 前台口令校验对历史 MD5 的兼容：去掉之后，所有还没升级的老账号会被一次性
#     全部挡在门外。
write_pair "legacy_md5_compat" \
'        if (self::isLegacyMd5($stored)) {' \
'        if (false) {'
mutate "legacy md5 password compatibility" \
    "crmeb/app/services/login/UserPassword.php" \
    "$work/.mutations/legacy_md5_compat.old" "$work/.mutations/legacy_md5_compat.new" \
    "StorefrontLoginSecurityTest::testALegacyMd5PasswordIsUpgradedToBcryptOnSuccessfulLogin"

# 18. 上传目录的 PHP 执行拦截：去掉之后，上传上来的 .php 会被 php-fpm 解释，
#     扩展名白名单就重新变成唯一的一道防线。
write_pair "uploads_php_deny" \
'        location ~* \.(ph(p[3457]?|t|tml|ar))$ { deny all; }' \
'        location ~* \.(never-matches-anything)$ { deny all; }'
mutate "uploads php execution deny" \
    "docker/regression/nginx.conf" \
    "$work/.mutations/uploads_php_deny.old" "$work/.mutations/uploads_php_deny.new" \
    "UploadExecutionTest::testAFileWithAnExecutableExtensionIsNotServedAsCode"

# 18b. 上传目录里的点文件拦截：`^~` 会让 nginx 跳过全局那条 `location ~ /\.`，
#      所以这条拒绝必须在上传目录的块里自己写一遍。去掉它，堵住 PHP 执行的同一个
#      改动就顺手把点文件重新放了出来。
write_pair "uploads_dotfile_deny" \
'        location ~ /\. { deny all; access_log off; log_not_found off; }' \
'        location ~ /never-matches-anything { deny all; }'
mutate "uploads dotfile deny" \
    "docker/regression/nginx.conf" \
    "$work/.mutations/uploads_dotfile_deny.old" "$work/.mutations/uploads_dotfile_deny.new" \
    "UploadExecutionTest::testADotFileUnderUploadsIsNotServed"

# 19. 对账巡检读的是"人工清单"而不是自动补投队列：换回 pendingIds 之后，最需要
#     人处理的那些记录（通知/打印结果未知、重试用尽）会被整批漏掉，告警变成安慰剂。
write_pair "reconcile_manual_scope" \
'        $effects = app()->make(StoreOrderEffectServices::class)->manualIds(self::SCAN_LIMIT);' \
'        $effects = app()->make(StoreOrderEffectServices::class)->pendingIds(self::SCAN_LIMIT);'
mutate "reconcile alert scans the manual list" \
    "crmeb/app/services/order/OrderReconcileAlertServices.php" \
    "$work/.mutations/reconcile_manual_scope.old" "$work/.mutations/reconcile_manual_scope.new" \
    "ReconcileAlertTest"

# 20. 冷却只看最近 LOGIN_COOLDOWN 秒：换成整个 15 分钟计数窗口之后，任何人都能靠
#     持续制造失败把某个顾客账号无限期锁在门外。
write_pair "storefront_cooldown_bound" \
'        if ($guard->accountFailuresWithin((string)$account, self::LOGIN_COOLDOWN) >= self::LOGIN_FAILURES_BEFORE_COOLDOWN) {' \
'        if ($guard->accountFailures((string)$account) >= self::LOGIN_FAILURES_BEFORE_COOLDOWN) {'
mutate "storefront login cooldown is bounded" \
    "crmeb/app/api/controller/v1/LoginController.php" \
    "$work/.mutations/storefront_cooldown_bound.old" "$work/.mutations/storefront_cooldown_bound.new" \
    "StorefrontLoginSecurityTest::testTheCooldownExpiresInsteadOfLockingTheAccountIndefinitely"

echo
echo "mutation check: $passed detected, $failed undetected, $skipped skipped"
[ "$failed" -eq 0 ] || exit 1
