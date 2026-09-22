# CR-3-j2 — the image and deploy-rehearsal jobs for `.github/workflows/next.yml`

**Stream** J2 (container images and deployment) · **Against**
`.github/workflows/next.yml` (orchestrator-owned; the brief says the image and
rehearsal jobs come as a CR with exact YAML) and
`tests/static/release-pipeline-guard.cjs` · **Status** open · **Blocking** the
cutover — step 1 of `deploy/next/cutover.md` is "CI has published the three
images", and nothing publishes them today.

## What

`next.yml` today has three jobs — `static`, `integration`, `build` — and
publishes nothing. `deploy/next` deploys digests; there is no producer of
digests. And `deploy/next/**` is not in the workflow's `paths` filter, so a
change to the compose file or to `upgrade.sh` runs no CI at all.

Meanwhile the repository already owns the hard part. `scripts/publish-release.sh`
implements the publishing rules (a tag never changes value, a registry query
that cannot answer aborts rather than guessing "absent", a republish of the same
content is a no-op), and `tests/deployment/publish-release.sh` proves them
against a real registry. It takes the image name as an argument, so the three
new images can use it unchanged. **This CR reuses it; it adds no new publishing
logic, which is the point** — REL-006 exists to keep publish logic out of YAML.

## Proposed change

### 1. Widen the triggers

`deploy/next/**` is part of what this workflow should gate.

```yaml
on:
  push:
    branches: [master, 'rewrite/**']
    paths:
      - 'next/**'
      - 'deploy/next/**'
      - '.github/workflows/next.yml'
  pull_request:
    paths:
      - 'next/**'
      - 'deploy/next/**'
      - '.github/workflows/next.yml'
  workflow_dispatch:
```

### 2. A `shell` job

`defaults.run.working-directory` is `next`, so this job overrides it.

```yaml
  shell:
    name: shellcheck (deploy/next)
    runs-on: ubuntu-latest
    timeout-minutes: 5
    defaults:
      run:
        working-directory: .
    steps:
      - uses: actions/checkout@v5

      # `-x` follows `. lib/common.sh`, and --source-path=SCRIPTDIR resolves it
      # relative to each script rather than to the working directory — without
      # it the library is invisible and every variable it sets reads as unset.
      - name: shellcheck
        run: |
          shellcheck --source-path=SCRIPTDIR -x \
            deploy/next/*.sh deploy/next/lib/*.sh deploy/next/rehearsal/*.sh
```

### 3. An `images` job

```yaml
  images:
    name: images (web, worker, edge)
    runs-on: ubuntu-latest
    timeout-minutes: 40
    needs: [static, build]
    # Publishing happens for the branches that can become a release. A pull
    # request builds in `rehearsal` below and pushes nothing.
    if: github.event_name == 'push'
    permissions:
      contents: read
      packages: write
    defaults:
      run:
        working-directory: .
    env:
      WEB_IMAGE: ghcr.io/xiangyumou/crmeb-next-web
      WORKER_IMAGE: ghcr.io/xiangyumou/crmeb-next-worker
      EDGE_IMAGE: ghcr.io/xiangyumou/crmeb-next-edge
    steps:
      - uses: actions/checkout@v5

      - uses: docker/setup-buildx-action@v4

      - name: Log in to GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      # The storefront bundle, when this checkout has one. The edge image
      # defaults to a placeholder page, which is right for a stack that only
      # serves /admin and the APIs and wrong for a release — so the release
      # path has to be explicit about which one it baked in.
      - name: Resolve the H5 bundle
        id: h5
        run: |
          set -euo pipefail
          if [ -d template/uni-app/dist/build/h5 ]; then
            storefront=real
            dist=template/uni-app/dist/build/h5
          else
            storefront=placeholder
            dist=next/docker/edge/h5-placeholder
          fi
          printf 'dist=%s\n' "$dist" >> "$GITHUB_OUTPUT"
          printf 'storefront=%s\n' "$storefront" >> "$GITHUB_OUTPUT"

      # One architecture. The production host is a single amd64 box (PLAN §7),
      # so a second one would double the build for an image nothing will run.
      #
      # `docker/build-push-action` rather than a bare `docker buildx build`:
      # `type=gha` needs the Actions cache token, which the action puts in the
      # environment and a plain `run:` step does not have.
      - name: web
        uses: docker/build-push-action@v6
        with:
          context: ./next
          file: next/docker/web.Dockerfile
          push: true
          tags: ${{ env.WEB_IMAGE }}:ci-${{ github.sha }}-amd64
          cache-from: type=gha,scope=next-web
          cache-to: type=gha,scope=next-web,mode=max

      - name: worker
        uses: docker/build-push-action@v6
        with:
          context: ./next
          file: next/docker/worker.Dockerfile
          push: true
          tags: ${{ env.WORKER_IMAGE }}:ci-${{ github.sha }}-amd64
          cache-from: type=gha,scope=next-worker
          cache-to: type=gha,scope=next-worker,mode=max

      # Context is the repository root: the edge image copies the nginx config
      # from `next/docker/edge/` and the storefront from `template/`.
      - name: edge
        uses: docker/build-push-action@v6
        with:
          context: .
          file: next/docker/edge/Dockerfile
          push: true
          build-args: H5_DIST=${{ steps.h5.outputs.dist }}
          tags: ${{ env.EDGE_IMAGE }}:ci-${{ github.sha }}-amd64
          cache-from: type=gha,scope=next-edge
          cache-to: type=gha,scope=next-edge,mode=max

      # The publish rules live in scripts/publish-release.sh (proved against a
      # real registry by tests/deployment/publish-release.sh), not inline here,
      # so they are exercised rather than read. REL-006 is the guard that keeps
      # it that way.
      - name: Publish the commit-scoped tags
        id: publish
        run: |
          set -euo pipefail
          for role in web worker edge; do
            case "$role" in
              web) image="$WEB_IMAGE" ;;
              worker) image="$WORKER_IMAGE" ;;
              edge) image="$EDGE_IMAGE" ;;
            esac
            digest="$(bash scripts/publish-release.sh tags "$image" "$GITHUB_SHA" \
              "$image:ci-$GITHUB_SHA-amd64" | tail -1)"
            test -n "$digest"
            printf '%s=%s@%s\n' "$role" "$image" "$digest" >> "$GITHUB_OUTPUT"
          done

      # The three lines an operator pastes into `deployment.env`, and the three
      # arguments `upgrade.sh` wants. A release whose digests have to be dug out
      # of a log is a release that gets deployed by tag.
      - name: Release summary
        run: |
          {
            printf '## crmeb-next images\n\n'
            printf 'storefront in the edge image: **%s**\n\n' '${{ steps.h5.outputs.storefront }}'
            printf '```sh\ndeploy/next/upgrade.sh --app-version %s \\\n' "$GITHUB_SHA"
            printf '  --web    %s \\\n'   '${{ steps.publish.outputs.web }}'
            printf '  --worker %s \\\n'   '${{ steps.publish.outputs.worker }}'
            printf '  --edge   %s\n```\n' '${{ steps.publish.outputs.edge }}'
          } >> "$GITHUB_STEP_SUMMARY"
```

### 4. A `rehearsal` job

```yaml
  rehearsal:
    name: deploy rehearsal
    runs-on: ubuntu-latest
    # The drill brings a full stack up several times over; it is the slowest
    # job here and still the cheapest place to find out that a release cannot
    # be rolled back.
    timeout-minutes: 45
    needs: [shell]
    defaults:
      run:
        working-directory: .
    steps:
      - uses: actions/checkout@v5

      - uses: docker/setup-buildx-action@v4

      # Failing a release for an unrelated registry hiccup mid-drill teaches
      # people to rerun rather than to read, so the fixed dependencies are
      # pulled up front.
      - name: Pre-pull
        run: |
          set -euo pipefail
          docker pull registry:2
          grep -E '^NEXT_(POSTGRES|REDIS)_IMAGE=' deploy/next/deployment.env.example |
            cut -d= -f2- | xargs -rn1 docker pull

      # It builds the three images itself, publishes them to a registry
      # container it starts, and deploys, fails, and rolls back a stack several
      # times. Nothing leaves the runner.
      - name: Drill
        run: deploy/next/rehearsal/drill.sh

      - name: What it covers
        if: always()
        run: deploy/next/rehearsal/drill.sh --list >> "$GITHUB_STEP_SUMMARY"
```

### 5. Extend the release guard (REL-006, REL-007)

`tests/static/release-pipeline-guard.cjs` asserts the *legacy* workflow keeps
publish logic in the tested script and never cancels a release mid-publish. The
new workflow needs the same guard or the rule applies to one pipeline and not
the other. Append, after the existing `container` assertions:

```js
// --- the rewrite's images (CR-3-j2) --------------------------------------
const next = read('.github/workflows/next.yml');

assert(
  /scripts\/publish-release\.sh tags/.test(next),
  'the next workflow publishes tags through the tested script',
);
assert(
  !/resolve_digest\(\)/.test(next) && !/imagetools create/.test(next),
  'the next workflow must not carry its own publish helpers',
);
assert(
  !/publish-release\.sh promote/.test(next),
  'automated publishing never moves a deployment tag',
);
// A release is never cancelled mid-publish. `next.yml` cancels in progress for
// the merge-gate jobs, which is right, so the publishing job carries its own
// repository-wide concurrency group instead.
assert(
  /group:\s*next-images-\$\{\{\s*github\.repository\s*\}\}/.test(next) &&
    /next-images[\s\S]{0,200}cancel-in-progress:\s*false/.test(next),
  'image publishing is serialized repository-wide and never cancelled',
);
assert(
  /deploy\/next\/rehearsal\/drill\.sh/.test(next),
  'the deploy rehearsal runs in CI',
);
```

That last concurrency assertion needs the `images` job to declare its own group,
since a workflow-level `cancel-in-progress: true` would otherwise kill a publish
halfway:

```yaml
  images:
    …
    concurrency:
      group: next-images-${{ github.repository }}
      cancel-in-progress: false
```

## Two things this CR deliberately does not do

- **No `promote` / deployment tag.** The legacy pipeline has a manual promotion
  workflow that moves an `edge` tag. The new stack has no moving tag by design:
  `deployment.env` holds digests and `upgrade.sh` refuses anything else, so the
  "promotion" step is a human pasting the digests from the job summary into the
  upgrade command. Adding a moving tag would create the exact artifact the rest
  of this stream refuses to deploy from.
- **No deploy from CI.** Nothing in this YAML touches the production host. The
  cutover is `deploy/next/cutover.md`, run by a person over SSH, and step 5 of
  it is the first time a new image runs anywhere but a runner.

## Workaround in place

None — the images build and the drill runs locally, and that is all that is
possible from J2's worktree. `deploy/next/rehearsal/drill.sh` is written so this
job is three lines, and the shellcheck invocation above is the one J2 has been
running by hand.
