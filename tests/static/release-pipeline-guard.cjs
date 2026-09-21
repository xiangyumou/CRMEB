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

console.log('release-pipeline-guard: ok');
