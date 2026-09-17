#!/usr/bin/env bash
set -Eeuo pipefail
source_dir="${1:?usage: cache-assets.sh PUBLIC_DIR CACHE_DIR}"
cache_dir="${2:?usage: cache-assets.sh PUBLIC_DIR CACHE_DIR}"
test -d "$source_dir" && mkdir -p "$cache_dir"
find "$source_dir" -regextype posix-extended \
  \( -path "$source_dir/uploads" -o -path "$source_dir/install" \) -prune -o \
  -type f -regex '.*\.[a-f0-9]{8,}\.(js|css|png|jpe?g|webp|svg|woff2?|ttf)' -print0 \
  | while IFS= read -r -d '' file; do
    relative="${file#"$source_dir"/}"
    target="$cache_dir/$relative"
    mkdir -p "$(dirname "$target")"
    if test -e "$target"; then
      cmp -s "$file" "$target" || { echo "Asset hash collision: $relative" >&2; exit 1; }
    else
      cp "$file" "$target"
    fi
  done
