# shellcheck shell=bash
# The readiness gate. Sourced by upgrade.sh and rollback.sh; also runnable on
# its own through `deploy/next/readyz.sh`.
#
# `/healthz` and `/readyz` at the edge are shallow by design — `/healthz` is
# nginx answering for itself and `/readyz` is the chain through to the Next
# server. Neither one knows whether the schema is present or the worker is
# consuming, and a container healthcheck must not know: a probe that opens a
# PostgreSQL connection restarts the container when the database blips
# (apps/web/src/server/health.ts says so in as many words).
#
# So the deep check lives here, where a *release* is gated on it and an
# orchestrator is not acting on it. Five things, in the order they fail
# usefully:
#
#   1. every service Compose started reports healthy;
#   2. the edge answers /healthz for itself;
#   3. the edge answers /readyz through to the app, with status ok;
#   4. the schema is migrated — the migrations table is populated and the
#      tables the release needs exist;
#   5. the worker heartbeat is fresh, read with the image's own probe.
#
# CR-1-j2 asks `apps/web` for a real `/readyz` route that folds 4 into an HTTP
# answer. Until it lands, 4 is a query; after it lands, this file keeps the
# query as the second opinion it always should have been.

# Tables every release needs before it can serve. Deliberately a small,
# hand-picked list rather than "count the tables": a count passes on a schema
# that migrated halfway.
READINESS_TABLES="${NEXT_READINESS_TABLES:-config_values admins roles orders products}"

readiness_services_healthy() {
  local service container status failed=0
  for service in $APP_SERVICES $DATA_SERVICES; do
    container="$(compose ps -q "$service" 2>/dev/null || true)"
    if [ -z "$container" ]; then
      warn "readiness: $service is not running"
      failed=1
      continue
    fi
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    case "$status" in
      healthy | running) ;;
      *)
        warn "readiness: $service is $status"
        failed=1
        ;;
    esac
  done
  return "$failed"
}

# Probed from inside the edge container. That is not a shortcut around the
# published port — it is the same request the container healthcheck makes, and
# it works identically whether the port is on loopback or behind Traefik. The
# published port is checked separately below.
readiness_edge_probe() {
  local path="$1" body
  if ! body="$(compose exec -T edge wget -q -O - "http://127.0.0.1$path" 2>/dev/null)"; then
    warn "readiness: the edge did not answer $path"
    return 1
  fi
  printf '%s' "$body"
}

readiness_http() {
  local body
  body="$(readiness_edge_probe /healthz)" || return 1
  case "$body" in
    ok*) ;;
    *)
      warn "readiness: /healthz answered '$body'"
      return 1
      ;;
  esac

  body="$(readiness_edge_probe /readyz)" || return 1
  case "$body" in
    *'"status":"ok"'*) ;;
    *)
      warn "readiness: /readyz did not report ok"
      return 1
      ;;
  esac

  # And once through the published port, so a stack that is healthy inside and
  # unreachable outside is not called ready.
  local bind
  bind="$(setting NEXT_EDGE_BIND)"
  bind="${bind:-127.0.0.1:8080}"
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 10 "http://$bind/healthz" -o /dev/null || {
      warn "readiness: the published port $bind did not answer /healthz"
      return 1
    }
  fi
}

readiness_schema() {
  local applied table present
  applied="$(psql_q "select count(*) from drizzle.__drizzle_migrations" 2>/dev/null || true)"
  if [ -z "$applied" ] || [ "$applied" -lt 1 ] 2>/dev/null; then
    warn "readiness: no migration has been applied (drizzle.__drizzle_migrations is empty or absent)"
    return 1
  fi
  for table in $READINESS_TABLES; do
    present="$(psql_q "select to_regclass('public.$table') is not null" 2>/dev/null || true)"
    if [ "$present" != 't' ]; then
      warn "readiness: the table '$table' is missing"
      return 1
    fi
  done
  say "readiness: $applied migration(s) applied, required tables present"
}

readiness_worker() {
  # The image's own probe, so the gate and the container healthcheck cannot
  # disagree about what a live worker is.
  if ! compose exec -T worker node /app/healthcheck.mjs; then
    warn 'readiness: the worker heartbeat is missing or stale'
    return 1
  fi
}

readiness_gate() {
  local failed=0
  readiness_services_healthy || failed=1
  readiness_http || failed=1
  readiness_schema || failed=1
  readiness_worker || failed=1
  if [ "$failed" -ne 0 ]; then
    warn 'readiness gate: FAILED'
    return 1
  fi
  say 'readiness gate: passed'
}
