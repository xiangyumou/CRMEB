# CR-1-p0a — decide the four undecided build scripts in `pnpm-workspace.yaml`

**Status (R5 sweep, 2026-09-23): RESOLVED** — applied and kept: `pnpm-workspace.yaml` `allowBuilds` (`08135d139`). The status line below is kept as history.

**Stream:** P0-a platform **Status:** applied on `rewrite/ws-p0a-platform`, needs the orchestrator's blessing
**Owner of the file:** orchestrator (`next/pnpm-workspace.yaml` is a root file)

## What

Added four entries to `allowBuilds`, all `false`:

```yaml
allowBuilds:
  cpu-features: false # optional CPU detection for ssh2 (testcontainers -> docker-modem)
  esbuild: true
  msgpackr-extract: false # optional msgpack accelerator for bullmq
  protobufjs: false # postinstall only wires up its own CLI, unused here
  ssh2: false # pure-JS crypto fallback; only used to talk to a remote docker host
```

## Why

`pnpm install` **fails outright** without them:

```
Error: ERR_PNPM_IGNORED_BUILDS
  × installing dependencies
  ╰─▶ Ignored build scripts: cpu-features@0.0.10, msgpackr-extract@3.0.4,
      protobufjs@7.6.6, ssh2@1.17.0
```

pnpm 12 refuses to proceed while any dependency's build script is undecided, and
it writes `set this to true or false` placeholders into the workspace file. So
this is not optional; the only decision is `true` or `false`.

All four are **optional native accelerators with a working pure-JS fallback**:

| package            | comes from                                 | what its build does                        | consequence of `false`                                        |
| ------------------ | ------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------- |
| `cpu-features`     | `testcontainers` → `docker-modem` → `ssh2` | compiles CPU feature detection             | ssh2 uses its JS crypto path                                  |
| `ssh2`             | same                                       | builds `cpu-features`                      | only used for a _remote_ docker host; we use the local socket |
| `msgpackr-extract` | `bullmq` → `msgpackr`                      | native msgpack decoder                     | msgpackr falls back to JS                                     |
| `protobufjs`       | transitive                                 | postinstall only installs its own CLI deps | unused                                                        |

`false` keeps a C toolchain out of CI and off the 2-core / 3.6 GB production box
(PLAN §7 "2 核 3.6 GB 内存压力"), which the brief also asks for: "prefer a
pure-JS/wasm or prebuilt alternative".

## Impact

None on contracts or tables. `pnpm install` goes from failing to succeeding.

## Ask

Confirm the four `false` values, or tell me which should be `true` and I will
add the toolchain to the CI image.
