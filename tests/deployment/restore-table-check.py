"""Exercise the upgrade's actual restore comparison against injected DB responses."""
import os
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[2]
script = (root / 'deploy/production/upgrade.sh').read_text()
start = script.index('    for table_pk in ')
end = script.index('\n  fi\n  docker rm -f', start)
loop = script[start:end]
harness = r'''
set -Eeuo pipefail
restore_failed=0
db_prefix=eb_
mysql_service=mysql
check_container=restore
fake_db() {
  local side="$1"; shift
  local args="$*"
  if [[ "$args" == *information_schema.tables* ]]; then
    if [ "$CASE" = query_error ]; then return 1; fi
    if [[ "$args" == *eb_store_order_payment_attempt* || "$args" == *eb_store_order_effect* || "$args" == *eb_store_order_payment_exception* ]]; then
      if [ "$CASE" = legacy ]; then echo 0; return; fi
      if [ "$CASE" = missing_optional ] && [ "$side" = restored ]; then echo 0; return; fi
    fi
    if [ "$CASE" = missing_required ] && [[ "$args" == *"'eb_user'"* ]]; then echo 0; return; fi
    echo 1
  elif [[ "$args" == *'SELECT COUNT(*) FROM'* ]]; then
    if [ "$CASE" = count_mismatch ] && [ "$side" = restored ]; then echo 2; else echo 1; fi
  else
    if [ "$CASE" = hash_error ]; then return 1; fi
    if [ "$CASE" = content_mismatch ] && [ "$side" = restored ]; then echo changed; else echo original; fi
  fi
}
compose() { fake_db live "$@"; }
docker() { fake_db restored "$@"; }
'''
for case in ['matching', 'legacy', 'missing_optional', 'missing_required', 'query_error', 'count_mismatch', 'content_mismatch', 'hash_error']:
    expected = '0' if case in ['matching', 'legacy'] else '1'
    result = subprocess.run(['bash', '-c', harness + loop + '\nprintf "%s" "$restore_failed"'],
                            env={**os.environ, 'CASE': case}, capture_output=True, text=True)
    assert result.returncode == 0 and result.stdout == expected, (case, result.stdout, result.stderr)
    print('ok -', case)
