#!/usr/bin/env bash
# Run the readiness gate on its own, without deploying anything.
#
#   deploy/next/readyz.sh
#
# Read-only: it starts nothing, stops nothing and writes nothing. Use it after
# a manual `up`, during a first-deploy smoke test, or to find out why a release
# was rolled back. Exit 0 means every check in lib/readiness.sh passed.
set -Eeuo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "$here/lib/common.sh"
# shellcheck source=lib/readiness.sh
. "$here/lib/readiness.sh"

require_settings
readiness_gate
