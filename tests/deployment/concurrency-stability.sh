#!/usr/bin/env bash
# Repeat the concurrency-critical cases to prove they are stable, not lucky.
#
# The plan requires each concurrency scenario to be exercised in at least two
# distinct execution orders, repeated ten times. The orderings are produced by
# the tests themselves (two processes released together, plus the barrier-held
# variants that pin which side reaches the gateway or the lock first), and this
# script runs the set repeatedly. Any flake fails the whole run and the output
# of the failing repetition is kept.
#
# Usage: bash tests/deployment/concurrency-stability.sh [IMAGE] [REPETITIONS]
set -Eeuo pipefail

root="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)"
image="${1:-crmeb-test}"
repetitions="${2:-10}"
project="crmeb-stability-$$"
work="$(mktemp -d)"
failures=0

cleanup() {
    docker compose -p "$project" -f "$root/docker/regression/compose.yml" down --volumes --remove-orphans >/dev/null 2>&1 || true
    rm -rf "$work"
}
trap cleanup EXIT INT TERM

# The image must name the revision the suite was last green on AND the working
# tree must not have changed code since then: a docs-only commit on top of the
# tested revision is fine, a source change is not.
image_revision="$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
test -n "$image_revision" || { echo "image $image carries no revision label" >&2; exit 1; }
git -C "$root" cat-file -e "$image_revision^{commit}" 2>/dev/null || {
    echo "the image names $image_revision, which is not a commit in this repository" >&2
    exit 1
}
if ! git -C "$root" diff --quiet "$image_revision" -- \
        crmeb/app crmeb/crmeb crmeb/config crmeb/route crmeb/upgrade crmeb/public tests; then
    echo "code changed since the image was built ($image_revision); rebuild before reporting" >&2
    exit 1
fi

export CRMEB_TEST_IMAGE="$image"
# The compose file is used in place: its relative bind mounts (the install SQL)
# resolve against its own directory, and `-p` takes precedence over the file's
# own project name, which is all this run needs to stay isolated.
compose_file="$root/docker/regression/compose.yml"

for volume in runtime uploads; do
    docker volume create "${project}_$volume" >/dev/null
done
# Populate the shared volumes serially before any container mounts them: php-fpm
# and workerman racing that copy is what kills the normal stack.
docker run --rm --entrypoint sh \
    -v "${project}_runtime:/var/www/crmeb/runtime" \
    -v "${project}_uploads:/var/www/crmeb/public/uploads" \
    "$image" -c 'test -d /var/www/crmeb/runtime/temp' >/dev/null
docker compose -p "$project" -f "$compose_file" up -d mysql redis php-fpm workerman nginx >/dev/null 2>&1 ||
    { echo 'the stability stack did not start' >&2; exit 1; }

# The concurrency-critical set: payment creation vs cancellation, refund
# agreement in two processes, the coupon races, the virtual-card race, the
# multi-item rollback and the fixed-seed state sequence.
filter='PaymentConcurrencyTest|RefundConcurrencyTest|OrderBusinessInvariantTest|FulfillmentAtomicityTest|OrderStateSequenceTest|QueueTest'

for i in $(seq 1 "$repetitions"); do
    if docker compose -p "$project" -f "$compose_file" run --rm regression \
            php /tests/regression/vendor/bin/phpunit --configuration /tests/regression/phpunit.xml \
            --filter "$filter" > "$work/run-$i.log" 2>&1; then
        printf 'repetition %d/%d: ok (%s)\n' "$i" "$repetitions" \
            "$(grep -oE 'OK \([0-9]+ tests, [0-9]+ assertions\)' "$work/run-$i.log" | tail -1)"
    else
        failures=$((failures + 1))
        printf 'repetition %d/%d: FAILED\n' "$i" "$repetitions" >&2
        sed -n '/There w/,$p' "$work/run-$i.log" | head -40 >&2
        cp "$work/run-$i.log" "/tmp/crmeb-stability-failure-$i.log"
        echo "  log kept at /tmp/crmeb-stability-failure-$i.log" >&2
    fi
done

if [ "$failures" -ne 0 ]; then
    echo "concurrency stability: $failures of $repetitions repetitions failed" >&2
    exit 1
fi
echo "concurrency stability: $repetitions/$repetitions repetitions green"
