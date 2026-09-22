'use strict';
/**
 * Keep the release pipeline's safety properties in the workflow files.
 *
 * The publish *rules* live in scripts/publish-release.sh and are exercised
 * against a real registry by tests/deployment/publish-release.sh. What this
 * guard checks is that the workflows actually call that tested code instead of
 * re-implementing it inline, and that the separation the plan requires holds:
 * the automated workflow publishes an immutable commit-scoped candidate, and the
 * deployment tag moves only through the manual promotion workflow (which never
 * builds anything).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

const container = fs.readFileSync(path.join(root, '.github/workflows/container.yml'), 'utf8');
const promote = fs.readFileSync(path.join(root, '.github/workflows/promote.yml'), 'utf8');
const script = fs.readFileSync(path.join(root, 'scripts/publish-release.sh'), 'utf8');

// 1. Publishing goes through the tested script, not inline bash.
assert(/scripts\/publish-release\.sh tags/.test(container), 'the container workflow publishes tags through the tested script');
assert(/scripts\/publish-release\.sh assets/.test(container), 'release assets go through the tested script');
assert(/scripts\/publish-release\.sh release-image/.test(container), 'the release image goes through the tested script');
assert(
  !/resolve_digest\(\)/.test(container),
  'the digest/publish helpers must not be re-implemented inline in the workflow'
);

// 2. The rules themselves are present in the script.
assert(/refusing to guess/.test(script), 'an unanswerable tag query must abort');
assert(/refusing a conflicting release/.test(script), 'a conflicting digest must abort the publish');
assert(/is not published; refusing to move/.test(script), 'promotion refuses an unpublished candidate');
assert(/does not belong to commit/.test(script), 'promotion refuses a candidate from another commit');

// 3. Automated publishing never moves the deployment tag.
assert(
  !/publish-release\.sh promote[\s\S]{0,200}:edge/.test(container) || !/scripts\/publish-release\.sh promote/.test(container),
  'the automated workflow must not promote the deployment tag; promotion is manual'
);

// 4. The manual promotion workflow moves a digest and never builds.
assert(/workflow_dispatch/.test(promote), 'promotion is manually triggered');
for (const input of ['source_sha', 'candidate_digest', 'acceptance_record']) {
  assert(promote.includes(input), `promotion requires ${input}`);
}
assert(/acceptance record/.test(promote), 'promotion requires an acceptance record');
assert(/docs\/release-readiness\.md/.test(promote), 'the acceptance record is checked against the readiness document');
assert(
  !/docker\s+build\s+(?!x\s+imagetools)/.test(promote),
  'the promotion workflow must not rebuild the image: the verified digest is what ships'
);
assert(
  !/docker\s+push/.test(promote),
  'the promotion workflow pushes no image of its own; it only moves the deployment tag'
);
assert(/scripts\/publish-release\.sh promote/.test(promote), 'promotion uses the tested script');

// 6. The front-end artefact build stays reproducible. Measured before the fix:
//    two builds of one commit produced different H5 and mini-program digests,
//    because the working directory was a random mktemp path that vue-loader
//    feeds into every styled chunk's module id, and because the mini-program
//    compiler emitted components/home/index.json with the keys in an
//    unstable order. Either one makes a retried publish of the same commit
//    look like a content conflict, so both have to stay fixed.
const buildUni = fs.readFileSync(path.join(root, 'scripts/build-uni.sh'), 'utf8');
assert(!/\$\(mktemp/.test(buildUni), 'the uni-app build must not use a random working directory');
assert(/work="\$root\/\.build\/uni-work"/.test(buildUni), 'the uni-app build works from a fixed directory');
assert(/Object\.keys\(value\)\.sort\(\)/.test(buildUni), 'generated JSON keeps a stable key order');

// 5. Releases are serialized repository-wide, never cancelled mid-publish.
assert(
  /group:\s*container-publish-\$\{\{\s*github\.repository\s*\}\}/.test(container),
  'container publishing is serialized across the repository'
);
assert(/cancel-in-progress:\s*false/.test(container), 'a release is never cancelled mid-publish');


assert(/deployment-config\.tar\.gz[\s\S]*?deploy\/production\/upgrade\.sh/.test(container), 'deployment archive includes the upgrade entry point');

// 7. 每个运行完整门禁的 job 都必须先装好前端依赖。
//    门禁里的 core-store-front.cjs 会用 @babel/parser / vue-template-compiler 真的
//    解析前端源码，这两个包只存在于 template/admin/node_modules。regression job 从
//    docker/run-regression.sh 改成 check-maintenance.sh 时没有补上安装步骤，于是它
//    每次都在 MODULE_NOT_FOUND 上失败、publish 被跳过，master 连续多次没有产出任何
//    镜像——而失败信息看起来只是"某个 node 脚本挂了"，很容易被当成偶发。
//    这条断言把"跑门禁"和"装依赖"绑在一起。
{
  const jobs = container.split(/\n  (?=[a-z_]+:\n)/);
  const gateJobs = jobs.filter(job => /scripts\/check-maintenance\.sh/.test(job));
  assert(gateJobs.length > 0, 'at least one job runs the maintenance gate');
  for (const job of gateJobs) {
    const name = (job.match(/^\s*([a-z_]+):/) || [null, '<unnamed>'])[1];
    assert(
      /npm ci --prefix template\/admin/.test(job),
      `job ${name} runs the maintenance gate, so it must install template/admin dependencies first ` +
      '(tests/static/core-store-front.cjs loads @babel/parser from there)'
    );
  }
}

// --- the rewrite's images (CR-3-j2) --------------------------------------
//
// REL-006 and REL-007 are properties of *the release pipeline*, not of one
// workflow file. `next.yml` publishes three more images through the same
// tested script, so it gets the same assertions — otherwise the rule is
// enforced for the legacy pipeline and quietly not for the new one.
const next = fs.readFileSync(path.join(root, '.github/workflows/next.yml'), 'utf8');

assert(
  /scripts\/publish-release\.sh tags/.test(next),
  'the next workflow publishes tags through the tested script'
);
assert(
  !/resolve_digest\(\)/.test(next) && !/imagetools create/.test(next),
  'the next workflow must not carry its own publish helpers'
);
assert(
  !/publish-release\.sh promote/.test(next),
  'automated publishing never moves a deployment tag'
);
// A release is never cancelled mid-publish. `next.yml` cancels in progress for
// the merge-gate jobs, which is right, so the publishing job carries its own
// repository-wide concurrency group instead.
assert(
  /group:\s*next-images-\$\{\{\s*github\.repository\s*\}\}/.test(next) &&
    /next-images[\s\S]{0,200}cancel-in-progress:\s*false/.test(next),
  'image publishing is serialized repository-wide and never cancelled'
);
assert(
  /deploy\/next\/rehearsal\/drill\.sh/.test(next),
  'the deploy rehearsal runs in CI'
);

// --- the jobs CR-4-k adds -------------------------------------------------
//
// The three jobs `next/guards` and `next/e2e/admin` needed. They are asserted
// here rather than trusted to review for the same reason the image job is: a
// gate that is deleted, renamed or quietly made conditional stops running and
// nothing says so — the workflow simply goes green faster. Each assertion
// below names the property, not the YAML, so a job can be reorganised freely
// and can only fail this by ceasing to do its job.
{
  const jobs = Object.fromEntries(
    next
      .split(/\n  (?=[a-z][a-z0-9-]*:\n)/)
      .map((chunk) => [(chunk.match(/^\s*([a-z][a-z0-9-]*):/) || [null, ''])[1], chunk])
  );

  // 1. The guards run inside the merge gate, not in a job of their own that a
  //    required-check list could forget to require.
  assert(
    /corepack pnpm guards/.test(jobs.static || ''),
    'the `static` merge-gate job runs `pnpm guards` (CR-4-k §1)'
  );

  // 2. The soak is nightly and on demand, and never a pull-request gate: it is
  //    a flake hunt of ~50× the integration suite, and a 40-minute gate stops
  //    being read. The `schedule:` trigger is what makes "nightly" true — the
  //    `if:` alone would make the job simply never run.
  const soak = jobs['concurrency-soak'] || '';
  assert(soak !== '', 'the 50-round concurrency soak job exists (STAB-001, CR-4-k §2)');
  assert(
    /schedule:\s*\n\s*- cron:/.test(next),
    'the soak has a schedule to run on; without one the `if` makes it dead code'
  );
  assert(
    /github\.event_name == 'schedule'/.test(soak) &&
      /github\.event_name == 'workflow_dispatch'/.test(soak),
    'the soak runs nightly and on demand only'
  );
  assert(
    /seq 1 50/.test(soak) && /--sequence\.shuffle/.test(soak),
    'the soak is 50 rounds with a different ordering seed each time, or it is not a soak'
  );
  // Stopping at the first failure throws away the distribution, which is the
  // thing worth knowing: "round 37 of 50" is a fact, "it failed" is not.
  assert(
    /failed=\$\(\(failed \+ 1\)\)/.test(soak) && /test "\$failed" -eq 0/.test(soak),
    'every round runs and the job fails on the count, rather than stopping at the first failure'
  );
  assert(
    /if: always\(\)/.test(soak) && /soak-logs/.test(soak),
    'the round logs are uploaded even when the job fails — especially then'
  );

  // 3. Admin e2e. Playwright cannot run a browser it has not installed, and
  //    the failure mode is a 30-minute job that fails in its last step.
  const e2e = jobs['e2e-admin'] || '';
  assert(e2e !== '', 'the admin e2e job exists (CR-4-k §3)');
  assert(
    /playwright install --with-deps chromium/.test(e2e),
    'the admin e2e job installs the browser before it runs the suite'
  );
  assert(
    e2e.indexOf('playwright install') < e2e.indexOf('@shop/e2e-admin e2e'),
    'the browser is installed before the suite runs, not after'
  );
  assert(
    /--filter @shop\/e2e-admin e2e/.test(e2e),
    'the admin e2e job runs the suite through its own `e2e` script'
  );
  assert(
    /playwright-report/.test(e2e),
    'a failed admin e2e run uploads its report; a trace nobody can read is not evidence'
  );

  // None of the three may publish. Only the image job does, and it is the one
  // the REL-006/007 assertions above are about.
  for (const [name, job] of [
    ['static', jobs.static || ''],
    ['concurrency-soak', soak],
    ['e2e-admin', e2e],
  ]) {
    assert(
      !/publish-release\.sh/.test(job) && !/docker\s+push/.test(job),
      `job ${name} must not publish anything: releases go through the image job alone`
    );
  }
}

console.log('release-pipeline-guard: ok');
