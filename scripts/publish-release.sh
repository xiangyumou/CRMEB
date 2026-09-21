#!/usr/bin/env bash
# Publish a candidate release without ever overwriting a different one.
#
# The publish rules live here, not inline in the workflow, so they can be
# exercised against a real registry (see tests/deployment/publish-release.sh)
# instead of being trusted by reading YAML:
#
#   * an existing tag whose digest differs aborts BEFORE anything is written —
#     for the application image, the release image and the GitHub Release assets;
#   * an authentication or network error while asking whether a tag exists is
#     never read as "the tag is absent";
#   * republishing the same candidate reproduces the same digest and is a no-op;
#   * assets are compared by content hash, so a rerun after a partial publish
#     fills in what is missing and refuses to mix different artifacts.
#
# Usage:
#   scripts/publish-release.sh <mode> [args]
#
#   scripts/publish-release.sh tags  <image> <sha> <arch-image>...
#       Publish the per-arch and multi-arch tags for one commit. Repeated
#       <arch-image>... pairs are passed straight to buildx imagetools create.
#
#   scripts/publish-release.sh release-image <image> <tag> <local-image>
#   scripts/publish-release.sh assets <release-tag> <file>...
#   scripts/publish-release.sh promote <edge-tag> <source-ref> <sha>
#       Move the deployment tag only when the source tag matches the commit.
#
# Environment: REGISTRY_TOOLS may point at a fake `docker` for tests; the script
# only ever calls `docker`, `gh` and `cmp`.
set -Eeuo pipefail

mode="${1:?usage: publish-release.sh <tags|release-image|assets|promote> [args]}"
shift || true

err_file="$(mktemp)"
trap 'rm -f "$err_file"' EXIT

# Echo the digest of a ref, or nothing when the ref is genuinely absent. A query
# that failed for authentication or network reasons aborts: guessing "absent"
# would republish over a release that is actually there.
resolve_digest() {
    local ref="$1" out
    if out="$(docker buildx imagetools inspect --format '{{.Manifest.Digest}}' "$ref" 2>"$err_file")"; then
        printf '%s\n' "$out"
        return 0
    fi
    if grep -qiE 'not found|no such manifest|manifest unknown|404 not found' "$err_file"; then
        return 0
    fi
    cat "$err_file" >&2
    echo "Could not determine whether $ref exists; refusing to guess" >&2
    return 1
}

# Publish a commit-scoped tag and refuse to let it change value.
#
# Build into a temporary registry reference first. A conflict is rejected while
# the formal immutable tag is still untouched; a temporary reference may remain
# after a failed run and is safe to garbage-collect by the registry policy.
publish_tag() {
    local target="$1"
    shift
    local before after candidate candidate_digest repo tag
    before="$(resolve_digest "$target")"
    repo="${target%:*}"
    tag="${target##*:}"
    candidate="$repo:__publish_${tag}_${BASHPID}_${RANDOM}"
    docker buildx imagetools create -t "$candidate" "$@"
    candidate_digest="$(resolve_digest "$candidate")"
    if [ -z "$candidate_digest" ]; then
        echo "Published temporary candidate $candidate but could not resolve its digest" >&2
        return 1
    fi
    if [ -n "$before" ] && [ "$before" != "$candidate_digest" ]; then
        echo "refusing a conflicting release for $target: it already held $before but the candidate is $candidate_digest" >&2
        return 1
    fi
    if [ -n "$before" ]; then
        printf '%s already held %s; resumed without change\n' "$target" "$before"
        return 0
    fi
    # Recheck immediately before the first write to catch a concurrent publish.
    before="$(resolve_digest "$target")"
    if [ -n "$before" ] && [ "$before" != "$candidate_digest" ]; then
        echo "refusing a conflicting release for $target: it appeared with $before while publishing" >&2
        return 1
    fi
    docker buildx imagetools create -t "$target" "$candidate"
    after="$(resolve_digest "$target")"
    if [ -z "$after" ]; then
        echo "Published $target but could not read its digest back; refusing to continue" >&2
        return 1
    fi
    [ "$after" = "$candidate_digest" ] || {
        echo "Published $target as $after, expected $candidate_digest; refusing to continue" >&2
        return 1
    }
    printf '%s published as %s\n' "$target" "$after"
}

# Move a deployment tag to an already-published candidate, refusing BEFORE any
# write when the two do not agree. Both refs are registry manifests here, so the
# digest is known in advance — and the deployment tag keeps its value on every
# refusal, which is the property a promotion must have.
promote_tag() {
    local target="$1" source="$2"
    local expected current
    expected="$(resolve_digest "$source")"
    test -n "$expected" || { echo "candidate $source is not published; refusing to move $target" >&2; return 1; }
    current="$(resolve_digest "$target")"
    if [ -n "$current" ] && [ "$current" = "$expected" ]; then
        printf '%s already points at %s\n' "$target" "$expected"
        return 0
    fi
    if [ -n "$current" ]; then
        printf 'moving %s from %s to %s (verified candidate)\n' "$target" "$current" "$expected"
    else
        printf '%s published as %s\n' "$target" "$expected"
    fi
    docker buildx imagetools create -t "$target" "$source"
    local after
    after="$(resolve_digest "$target")"
    if [ "$after" != "$expected" ]; then
        echo "Moving $target produced $after instead of $expected; refusing to continue" >&2
        return 1
    fi
}

case "$mode" in
tags)
    image="${1:?usage: publish-release.sh tags <image> <sha> <arch-image>...}"
    sha="${2:?usage: publish-release.sh tags <image> <sha> <arch-image>...}"
    shift 2
    arch_images=("$@")
    if [ "${#arch_images[@]}" -eq 0 ]; then
        echo 'no arch images given' >&2
        exit 1
    fi
    # Per-arch tags first, then the multi-arch manifest that joins them. These
    # tags are commit-scoped and immutable: they are published through the same
    # conflict guard as the joined manifest, so a rerun of one commit with
    # different arch content is refused instead of silently mixing two builds.
    arch_tags=()
    for arch_image in "${arch_images[@]}"; do
        # The source is CI-scoped (`<image>:ci-<sha>-<arch>`); the released
        # per-arch tag is `<image>:sha-<sha>-<arch>`. Taking the target as
        # `${arch_image##*:}` yielded the SOURCE tag, so when the source lives in
        # this same repository -- which is exactly what CI passes -- this
        # republished the CI tag onto itself. `imagetools create` re-wraps the
        # manifest under a new digest, so the conflict guard below then refused
        # the release every single time. Derive the architecture instead and
        # always name the target explicitly.
        arch="${arch_image##*-}"
        case "$arch" in
            ''|*[!a-z0-9]*)
                echo "cannot derive an architecture from $arch_image" >&2
                exit 1
                ;;
        esac
        publish_tag "$image:sha-$sha-$arch" "$arch_image"
        arch_tags+=("$image:sha-$sha-$arch")
    done
    publish_tag "$image:sha-$sha" "${arch_tags[@]}"
    digest="$(resolve_digest "$image:sha-$sha")"
    test -n "$digest" || { echo "could not resolve the published digest for $sha" >&2; exit 1; }
    printf '%s\n' "$digest"
    ;;
release-image)
    image="${1:?usage: publish-release.sh release-image <image> <tag> <local-image>}"
    tag="${2:?usage: publish-release.sh release-image <image> <tag> <local-image>}"
    local_image="${3:?usage: publish-release.sh release-image <image> <tag> <local-image>}"
    # A release image is addressed by content: pushing a tag that already exists
    # with a different manifest would mix two builds under one name.
    existing="$(resolve_digest "$image:$tag")"
    if [ -n "$existing" ]; then
        local_digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$local_image" 2>/dev/null | sed 's/.*@//' || true)"
        if [ -z "$local_digest" ]; then
            probe="$image:__release_probe_${BASHPID}_${RANDOM}"
            docker tag "$local_image" "$probe"
            docker push "$probe" >/dev/null
            local_digest="$(resolve_digest "$probe")"
        fi
        if [ -z "$local_digest" ] || [ "$local_digest" != "$existing" ]; then
            echo "Refusing to overwrite $image:$tag: it holds $existing but the built image is $local_digest" >&2
            exit 1
        fi
        echo "$image:$tag already holds $existing; nothing to push"
        exit 0
    fi
    docker push "$local_image"
    ;;
assets)
    release_tag="${1:?usage: publish-release.sh assets <release-tag> <file>...}"
    shift
    if [ "$#" -eq 0 ]; then
        echo 'no assets given' >&2
        exit 1
    fi
    release_view_error="$(mktemp)"
    release_exists=0
    if gh release view "$release_tag" >/dev/null 2>"$release_view_error"; then
        release_exists=1
    elif ! grep -qiE 'not found|release not found|http[[:space:]]*404' "$release_view_error"; then
        cat "$release_view_error" >&2
        rm -f "$release_view_error"
        echo "Could not determine whether GitHub release $release_tag exists; refusing to create or modify it." >&2
        exit 1
    fi
    rm -f "$release_view_error"
    if [ "$release_exists" -eq 0 ]; then
        gh release create "$release_tag" "$@" --latest=false
        exit 0
    fi
    # A rerun after a partial failure fills in what is missing and refuses to
    # overwrite an asset whose content differs.
    uploaded="$(gh release view "$release_tag" --json assets --jq '.assets[].name')"
    check_dir="$(mktemp -d)"
    trap 'rm -rf "$check_dir"; rm -f "$err_file"' EXIT
    for file in "$@"; do
        name="$(basename "$file")"
        if ! grep -qxF "$name" <<<"$uploaded"; then
            gh release upload "$release_tag" "$file"
            continue
        fi
        rm -f "$check_dir/$name"
        gh release download "$release_tag" --pattern "$name" --dir "$check_dir"
        if ! cmp -s "$file" "$check_dir/$name"; then
            echo "Release asset $name already exists with different content." >&2
            echo 'Investigate the existing release before deleting it; refusing to mix artifacts.' >&2
            exit 1
        fi
        echo "Release asset $name matches the local build"
    done
    ;;
promote)
    edge_tag="${1:?usage: publish-release.sh promote <edge-tag> <source-ref> <sha>}"
    source_ref="${2:?usage: publish-release.sh promote <edge-tag> <source-ref> <sha>}"
    sha="${3:?usage: publish-release.sh promote <edge-tag> <source-ref> <sha>}"
    case "$source_ref" in
        *@sha256:*)
            requested="${source_ref##*@}"
            resolved="$(resolve_digest "$source_ref")"
            [ "$resolved" = "$requested" ] || { echo "candidate digest cannot be verified; refusing to move $edge_tag" >&2; exit 1; }
            ;;
        *"sha-$sha"*) ;;
        *) echo "candidate $source_ref does not belong to commit $sha; refusing to move $edge_tag" >&2; exit 1 ;;
    esac
    promote_tag "$edge_tag" "$source_ref"
    ;;
*)
    echo "unknown mode: $mode" >&2
    exit 1
    ;;
esac
