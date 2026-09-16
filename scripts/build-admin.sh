#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output=${1:-"$root/template/admin/dist"}
case "$output" in
    /*) ;;
    *) printf '%s\n' 'Output must be an absolute path' >&2; exit 1 ;;
esac
case "$output/" in
    "$root/crmeb/public/"*) printf '%s\n' 'Refusing to write to checked-in public output' >&2; exit 1 ;;
esac

cd "$root/template/admin"
npm ci --no-audit --no-fund
NODE_OPTIONS=--openssl-legacy-provider npm run build -- --dest "$output"
