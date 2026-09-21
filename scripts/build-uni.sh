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
# A fixed work directory, not mktemp: the H5 and mini-program builds embed a
# hash of the working path in every styled chunk (vue-loader's style module id),
# so a random directory makes two builds of one source produce different
# artifacts and different release digests.
work="$root/.build/uni-work"
rm -rf "$work"
mkdir -p "$work"
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
  if [ "$target" = h5 ]; then
    index_css="$(grep -oE 'static/index\.[0-9a-f]{8}\.css' "$built/index.html" | head -n1 || true)"
    [ -n "$index_css" ] && [ -s "$built/$index_css" ] || { echo 'H5 index.html must link the built static/index.<hash>.css' >&2; exit 1; }
  fi
  test -s "$built/app.json" || [ "$target" = h5 ] || { echo 'Mini program app.json is missing' >&2; exit 1; }
  dest="$output/$target"
  if [ "$target" = mp-weixin ]; then dest="$output/mpWeixin"; fi
  rm -rf "$dest"
  cp -a "$built" "$dest"
done

# The mini-program compiler writes component descriptor keys in the order its
# resolver happened to visit them, so two builds of one source can differ
# byte-for-byte (components/home/index.json is the known case). JSON member
# order carries no meaning, so normalise it to keep the release digest stable.
node - "$output/h5" "$output/mpWeixin" <<'NODE'
const fs = require('fs');
const path = require('path');
const sorted = (value) => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sorted(value[key])]));
  }
  return value;
};
const normalize = (file) => {
  const raw = fs.readFileSync(file, 'utf8');
  const next = JSON.stringify(sorted(JSON.parse(raw)), null, 2);
  if (next !== raw) fs.writeFileSync(file, next);
};
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.json')) normalize(file);
  }
};
for (const dir of process.argv.slice(2)) walk(dir);
NODE
