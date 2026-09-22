# Stream J2 — Images and deployment (split from J)

**Worktree** `../CRMEB-wt/ws-j2` · **Branch** `rewrite/ws-j2-deploy` (from `rewrite/integration`) · **Owns** `next/docker/**`, `deploy/next/**`, the image / deploy-rehearsal jobs in `.github/workflows/next.yml` as a CR with the exact YAML, `docs/rewrite/status/j2.md` · J keeps `next/packages/etl/**` and will not touch your paths

Read `docs/rewrite/briefs/J-etl-deploy.md` §2 and §3 in full, its "Invariants to prove" rows for "Backup, upgrade and rollback", "Deployment topology", "Release publishing", and the read-only references `deploy/production/{compose.yml,nginx.conf,upgrade.sh,rollback.sh,README.md}`. The ETL step in `upgrade.sh` / `cutover.md` calls `pnpm --filter @shop/etl etl <command>` as J's brief names it — you do not implement it.

## Do
`web.Dockerfile`, `worker.Dockerfile` (justify `pnpm deploy --prod` vs esbuild bundle in the status file), `edge/` nginx, health/readiness for both apps (web's `/healthz` + `/readyz` exist; worker heartbeat is yours to define — read `apps/worker/src/container.ts`), `deploy/next/compose.yml` with limits under 1.6 GB, Traefik labels disabled by default, `migrate` one-shot, `upgrade.sh` / `rollback.sh` / `backup.sh` (`set -euo pipefail`, shellcheck-clean, no secrets in argv), `cutover.md` runbook following plan §6 with the rollback to the old stack (stopped, never deleted). Prove locally with `docker compose` (build both images, bring the stack up, hit readiness, run the upgrade script with a deliberately failing readiness gate and show it ends on the previous digests). CI YAML for image build (GHCR, digest-pinned) and the deploy rehearsal goes in `docs/rewrite/cr/CR-<n>-j2.md`.

## Rules
Never push, never SSH, never touch the production host; only your paths; commit after every unit with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`; lockfile never. No real credential or production dump anywhere.
