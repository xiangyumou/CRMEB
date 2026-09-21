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

echo
echo "mutation check: $passed detected, $failed undetected, $skipped skipped"
[ "$failed" -eq 0 ] || exit 1
