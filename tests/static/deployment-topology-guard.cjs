'use strict';
/**
 * Keep the deployment topology honest.
 *
 * The health probes and the readiness endpoint are the only thing standing
 * between a broken deployment and a green dashboard, so the properties that make
 * them meaningful are checked here as source-level invariants (their behaviour is
 * exercised against a real stack by docker/verify-http-stack.sh):
 *
 *  - no role may accept a configuration address it did not actually reach
 *    (the workerman probe used to fall back to 127.0.0.1 inside its own
 *    container, so a bad CLIENT_IP passed while every other container was cut
 *    off from the Channel server);
 *  - queue and timer must verify the Channel address they are configured with,
 *    not only their heartbeat;
 *  - /readyz must gate on the schema the release needs, including the unique
 *    indexes that carry the payment and refund concurrency guarantees;
 *  - the ready response must not leak database credentials or error details.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');

const healthcheck = fs.readFileSync(path.join(root, 'docker/healthcheck.php'), 'utf8');
const ready = fs.readFileSync(path.join(root, 'docker/ready.php'), 'utf8');
const compose = fs.readFileSync(path.join(root, 'deploy/production/compose.yml'), 'utf8');

// 1. The workerman probe reads its address from configuration and has no fallback.
assert(
  !/healthCheckWorkerman[\s\S]*?'127\.0\.0\.1'/.test(healthcheck),
  'the workerman probe must not fall back to 127.0.0.1: that hides a wrong CHANNEL.CLIENT_IP'
);
assert(
  /CHANNEL\.CLIENT_IP is not configured/.test(healthcheck),
  'the workerman probe must refuse an empty CLIENT_IP instead of guessing'
);

// 2. Queue and timer verify the configured Channel address as well as the heartbeat.
assert(
  /healthCheckQueueRole/.test(healthcheck),
  'queue and timer must check their Channel connection, not only a heartbeat'
);
assert(
  /case 'queue':[\s\S]{0,400}?case 'timer':[\s\S]{0,400}?healthCheckQueueRole\(/.test(healthcheck),
  'the queue and timer cases must call the combined heartbeat + channel check'
);

// 3. Role names stay in step with the deployment.
for (const role of ['php', 'queue', 'timer', 'workerman']) {
  assert(new RegExp(`\\b${role}\\b`).test(healthcheck), `healthcheck must know the ${role} role`);
}
// Every role in the production topology carries the probe for its own role name.
for (const role of ['php', 'queue', 'timer', 'workerman']) {
  const probe = new RegExp(`healthcheck\\.php\",?\\s*\"${role}\"`);
  assert(probe.test(compose), `the ${role} role must run its own healthcheck in the production topology`);
}

// 4. Readiness gates on the tables, columns and unique indexes the release needs.
for (const table of ['store_order_payment_attempt', 'store_order_effect', 'store_order_payment_exception']) {
  assert(ready.includes(`'${table}'`), `ready must require table ${table}`);
}
for (const column of ['out_refund_no', 'refund_request', 'refund_state']) {
  assert(ready.includes(`'${column}'`), `ready must require refund column ${column}`);
}
assert(/READY_REQUIRED_UNIQUE_INDEXES/.test(ready), 'ready must verify the unique indexes');
assert(/missing unique indexes/.test(ready), 'ready must report missing unique indexes');
assert(/non_unique = 0/i.test(ready), 'ready must read unique indexes from information_schema');

// 5. The response is a boolean and nothing else: no credentials, no error detail.
assert(
  /http_response_code\(503\)/.test(ready),
  'ready must answer 503 when the schema is incomplete'
);
assert(
  /\{"ready":false\}/.test(ready) || /"ready":false/.test(ready),
  'ready must answer with a bare ready flag'
);
assert(
  !/echo\s+[^;]*\$exception[^;]*;/.test(ready),
  'ready must not echo exception details (they can contain credentials)'
);
assert(
  /error_log/.test(ready),
  'ready should log the reason for the operator instead of returning it'
);

console.log('deployment-topology-guard: ok');
