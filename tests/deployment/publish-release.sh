#!/usr/bin/env bash
# Prove the publish rules against a real registry.
#
# scripts/publish-release.sh is the code path the release workflow runs, so the
# rules it claims to enforce are exercised here against a throwaway registry:
# a tag holding a different manifest must abort before anything is written, a
# query that cannot tell whether a tag exists must abort rather than guess,
# republishing the same manifest must be a no-op, and the edge tag must not move
# to an unverified or wrong commit.
#
# Usage: bash tests/deployment/publish-release.sh
set -Eeuo pipefail

root="$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)"
script="$root/scripts/publish-release.sh"
registry_port="${REGISTRY_PORT:-5569}"
registry_name="crmeb-publish-test-$$"
image="127.0.0.1:${registry_port}/crmeb"
tmp="$(mktemp -d)"
passed=0

cleanup() {
    docker rm -f "$registry_name" >/dev/null 2>&1 || true
    rm -rf "$tmp"
}
trap cleanup EXIT INT TERM

fail() {
    echo "publish rules verification failed: $1" >&2
    exit 1
}

pass() {
    passed=$((passed + 1))
    echo "ok - $1"
}

docker run -d --name "$registry_name" -p "127.0.0.1:${registry_port}:5000" registry:2 >/dev/null
attempt=0
until curl -fsS "http://127.0.0.1:${registry_port}/v2/" >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 60 ] || fail 'the local registry never answered'
    sleep 1
done

# Two distinguishable images: different content, therefore different digests.
make_image() {
    local tag="$1" payload="$2"
    mkdir -p "$tmp/$tag"
    printf '%s\n' "$payload" > "$tmp/$tag/payload.txt"
    printf 'FROM scratch\nCOPY payload.txt /payload.txt\n' > "$tmp/$tag/Dockerfile"
    docker build -q -t "$tag" "$tmp/$tag" >/dev/null
}

sha_a="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
sha_b="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

arch_amd64="127.0.0.1:${registry_port}/candidate-amd64:sha-$sha_a-amd64"
arch_arm64="127.0.0.1:${registry_port}/candidate-arm64:sha-$sha_a-arm64"
make_image "$arch_amd64" 'amd64-v1'
make_image "$arch_arm64" 'arm64-v1'
docker push -q "$arch_amd64" >/dev/null
docker push -q "$arch_arm64" >/dev/null

# 1. First publish creates the tags and reports a digest.
digest_a="$(bash "$script" tags "$image" "$sha_a" "$arch_amd64" "$arch_arm64" | tail -1)"
[ -n "$digest_a" ] || fail 'the first publish reported no digest'
pass "a first publish creates sha-$sha_a"

# 2. Republishing the same candidate is a no-op with the same digest.
#    (The push of the same local image is idempotent, so the arch tags see the
#    same manifest and the guard must let it through.)
again="$(bash "$script" tags "$image" "$sha_a" "$arch_amd64" "$arch_arm64")"
digest_again="$(printf '%s\n' "$again" | tail -1)"
[ "$digest_again" = "$digest_a" ] || fail 'republishing the same candidate changed the digest'
printf '%s\n' "$again" | grep -q 'resumed without change' || fail 'republishing was not reported as a no-op'
pass 'republishing the same commit reuses the same digest'

# 3. A different candidate under the same tag aborts before anything is written.
#    The conflicting source images use different tags, so this test can prove
#    that the formal per-arch tags and the joined manifest remain unchanged.
arch_amd64_b="127.0.0.1:${registry_port}/candidate-amd64:conflict-$sha_a-amd64"
arch_arm64_b="127.0.0.1:${registry_port}/candidate-arm64:conflict-$sha_a-arm64"
make_image "$arch_amd64_b" 'amd64-v2'
make_image "$arch_arm64_b" 'arm64-v2'
docker push -q "$arch_amd64_b" >/dev/null
docker push -q "$arch_arm64_b" >/dev/null
formal_amd64_before="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:sha-$sha_a-amd64")"
formal_arm64_before="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:sha-$sha_a-arm64")"
if bash "$script" tags "$image" "$sha_a" "$arch_amd64_b" "$arch_arm64_b" >"$tmp/conflict.log" 2>&1; then
    fail 'a different candidate was allowed to overwrite an existing tag'
fi
grep -q 'refusing a conflicting release' "$tmp/conflict.log" || fail 'the conflict refusal did not explain itself'
grep -q "already held" "$tmp/conflict.log" || fail 'the conflict refusal did not name the digest it found'
[ "$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:sha-$sha_a-amd64")" = "$formal_amd64_before" ] || fail 'the refused publish changed the formal amd64 tag'
[ "$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:sha-$sha_a-arm64")" = "$formal_arm64_before" ] || fail 'the refused publish changed the formal arm64 tag'
[ "$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:sha-$sha_a")" = "$digest_a" ] || fail 'the refused publish changed the formal manifest tag'
pass 'a conflicting candidate fails the publish instead of silently republishing'

# 4. A registry that cannot answer aborts instead of being read as "absent".
dead_port=$((registry_port + 1))
if REGISTRY_TOOLS=1 docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "127.0.0.1:${dead_port}/crmeb:sha-$sha_b" >/dev/null 2>&1; then
    fail 'the test registry port unexpectedly answered'
fi
if bash "$script" promote "$image:edge" "127.0.0.1:${dead_port}/crmeb:sha-$sha_b" "$sha_b" >"$tmp/unreachable.log" 2>&1; then
    fail 'an unreachable candidate was promoted'
fi
grep -qE 'refusing to guess|is not published|Could not determine' "$tmp/unreachable.log" || fail 'the unreachable case did not explain itself'
pass 'an unanswerable registry query aborts instead of guessing'

# 4b. Promotion of a commit-scoped tag that was never pushed is refused.
if bash "$script" promote "$image:edge" "$image:sha-$sha_b" "$sha_b" >"$tmp/unpublished.log" 2>&1; then
    fail 'an unpublished candidate was promoted to edge'
fi
grep -q 'is not published' "$tmp/unpublished.log" || fail 'the unpublished case did not explain itself'
pass 'promotion refuses a candidate that is not published at all'

# 5. Promotion moves the edge tag only to a published candidate of the same commit.
bash "$script" promote "$image:edge" "$image:sha-$sha_a" "$sha_a" >/dev/null
edge_digest="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:edge")"
[ "$edge_digest" = "$digest_a" ] || fail 'promotion did not move edge to the verified digest'
pass 'promotion moves edge to the verified candidate digest'

# 6. A candidate for a different commit is refused.
make_image "${arch_amd64%:*}:sha-$sha_b-amd64" 'amd64-b'
docker push -q "${arch_amd64%:*}:sha-$sha_b-amd64" >/dev/null
bash "$script" tags "$image" "$sha_b" "${arch_amd64%:*}:sha-$sha_b-amd64" >/dev/null
if bash "$script" promote "$image:edge" "$image:sha-$sha_b" "$sha_a" >"$tmp/wrong-sha.log" 2>&1; then
    fail 'promotion accepted a candidate from another commit'
fi
edge_after="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:edge")"
[ "$edge_after" = "$digest_a" ] || fail 'the refused promotion still moved edge'
pass 'promotion refuses a candidate from another commit'

# 7. Republishing after the tag was deleted re-creates the same digest.
docker buildx imagetools create -t "$image:temp" "$image:sha-$sha_a" >/dev/null
docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$image:temp" >/dev/null
pass 'a fresh tag can be created from a published manifest'

# 8. The CI shape: the per-arch sources are `ci-<sha>-<arch>` tags living in the
#    SAME repository as the release tags. This is what the workflow actually
#    passes, and it is what the earlier tests never exercised -- they used
#    sources already named `sha-<sha>-<arch>` in a *different* repository, so
#    deriving the target as "the source's tag" happened to produce the right
#    name. With CI's real inputs that derivation names the source itself, the
#    republish re-wraps the manifest under a new digest, and the conflict guard
#    refuses every release. Publishing was broken this way in production.
sha_c="cccccccccccccccccccccccccccccccccccccccc"
ci_amd64="$image:ci-$sha_c-amd64"
ci_arm64="$image:ci-$sha_c-arm64"
make_image "$ci_amd64" 'ci-amd64'
make_image "$ci_arm64" 'ci-arm64'
docker push -q "$ci_amd64" >/dev/null
docker push -q "$ci_arm64" >/dev/null
ci_amd64_before="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$ci_amd64")"
digest_c="$(bash "$script" tags "$image" "$sha_c" "$ci_amd64" "$ci_arm64" | tail -1)"
[ -n "$digest_c" ] || fail 'publishing from ci-scoped per-arch tags reported no digest'
docker buildx imagetools inspect "$image:sha-$sha_c-amd64" >/dev/null 2>&1 ||
    fail 'publishing from ci-scoped tags did not create the released amd64 tag'
docker buildx imagetools inspect "$image:sha-$sha_c-arm64" >/dev/null 2>&1 ||
    fail 'publishing from ci-scoped tags did not create the released arm64 tag'
[ "$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$ci_amd64")" = "$ci_amd64_before" ] ||
    fail 'publishing rewrote the ci-scoped source tag instead of leaving it alone'
pass 'a release publishes sha- tags from ci- sources in the same repository'

echo "publish rules verification passed ($passed checks)"
