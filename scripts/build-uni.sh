#!/usr/bin/env bash
set -Eeuo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
output="${1:?usage: scripts/build-uni.sh OUTPUT_DIRECTORY}"
case "$output" in /*) ;; *) echo 'Output must be an absolute path' >&2; exit 1 ;; esac
origin="${CRMEB_API_ORIGIN:-https://x-zoo.vip}"
node - "$origin" <<'NODE'
const value = process.argv[2];
const url = new URL(value);
if (url.protocol !== 'https:' || url.origin !== value || url.username || url.password) {
  throw Error('CRMEB_API_ORIGIN must be an HTTPS origin without credentials or a path');
}
NODE

source_dir="$root/template/uni-app"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/input/src" "$output"
tar -C "$source_dir" --exclude=node_modules --exclude=unpackage --exclude=.hbuilderx -cf - . | tar -C "$work/input/src" -xf -
for item in package.json babel.config.js postcss.config.js vue.config.js; do
  cp "$work/input/src/$item" "$work/input/$item"
done
cp -a "$work/input/src/public" "$work/input/public"
ln -s "$source_dir/node_modules" "$work/input/node_modules"
appid="${CRMEB_MP_APPID:-wx0000000000000000}"
[[ "$appid" =~ ^wx[0-9a-fA-F]{16}$ ]] || { echo 'CRMEB_MP_APPID must be wx followed by 16 hexadecimal characters' >&2; exit 1; }
node - "$work/input/src/manifest.json" "$appid" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest['mp-weixin'].appid = process.argv[3];
// This legacy project's dynamic uni calls are missed by the CLI H5 API scanner.
manifest.h5.optimization.treeShaking.enable = false;
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
NODE

for target in h5 mp-weixin; do
  (cd "$work/input" && VUE_APP_CRMEB_API_ORIGIN="$origin" NODE_ENV=production \
    UNI_CLI_CONTEXT="$work/input" UNI_INPUT_DIR="$work/input/src" \
    UNI_OUTPUT_DIR="$work/input/unpackage/dist/build/$target" UNI_PLATFORM="$target" \
    ./node_modules/.bin/vue-cli-service uni-build)
  built="$work/input/unpackage/dist/build/$target"
  test -s "$built/index.html" || [ "$target" = mp-weixin ] || { echo 'H5 index.html is missing' >&2; exit 1; }
  test -s "$built/app.json" || [ "$target" = h5 ] || { echo 'Mini program app.json is missing' >&2; exit 1; }
  dest="$output/$target"
  if [ "$target" = mp-weixin ]; then dest="$output/mpWeixin"; fi
  rm -rf "$dest"
  cp -a "$built" "$dest"
done
