#!/usr/bin/env bash
set -Eeuo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
test "$(node --version)" = v20.19.0 || { echo 'Node 20.19.0 required' >&2; exit 1; }
test "$(npm --version)" = 10.8.2 || { echo 'npm 10.8.2 required' >&2; exit 1; }
output="$root/.build/release"
mkdir -p "$root/.build"
rm -rf "$output"
mkdir -p "$output"
sh "$root/scripts/build-admin.sh" "$output/admin"
npm ci --prefix "$root/template/uni-app" --no-audit --no-fund
bash "$root/scripts/build-uni.sh" "$output"
node "$root/scripts/assemble-release.cjs"
