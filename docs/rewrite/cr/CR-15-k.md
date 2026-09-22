# CR-15-k — every delayed job the app schedules throws: BullMQ rejects a `jobId` with one colon in it

**Stream:** K (hardening) **Status:** OPEN — for the orchestrator / P0-A (kernel queue adapter)
**Files:** `next/packages/core/src/kernel/queue-bullmq.ts`,
`next/packages/core/src/order/order.checkout.service.ts`,
`next/packages/core/src/order/order.fulfil.service.ts`

## What

Found by the admin e2e suite on the first real shipment (`specs/order.spec.ts`):

```
POST /admin-api/orders/1/shipments → 500
{"type":"Error","message":"Custom Id cannot contain :",
 "stack":"… at rK.validateOptions … at rF.addJob … at Object.enqueue …"}
```

The kernel's BullMQ adapter maps the port's opaque `dedupeKey` straight onto
BullMQ's `jobId`:

```ts
// packages/core/src/kernel/queue-bullmq.ts:42
...(enqueueOptions.dedupeKey ? { jobId: enqueueOptions.dedupeKey } : {}),
```

and every `dedupeKey` in the repository is `name:id`:

| key | built in |
| --- | --- |
| `order-auto-cancel:<orderId>` | `order.checkout.service.ts:72`, used at `:614` |
| `order-auto-receive:<orderId>` | `order.fulfil.service.ts:594`, used at `:316` |
| `order-complete:<orderId>` | `order.fulfil.service.ts:595`, used at `:587` |

BullMQ 6.3.8 refuses that shape (`node_modules/bullmq/dist/cjs/classes/job.js`,
`Job.validateOptions`):

```js
if (this.opts?.jobId.includes(':') && this.opts?.jobId.split(':').length !== 3) {
  throw new Error('Custom Id cannot contain :');
}
```

One colon → two parts → throw. (Three parts is tolerated only for backwards
compatibility with old repeatable-job ids, so `a:b:c` passing is an accident,
not a licence.)

## Why it matters

The enqueue is **after** the transaction commits, correctly and deliberately
("a queue is not transactional", `order.checkout.service.ts:66`). So the throw
lands after the shipment row exists:

- the order really is shipped, the shipment row is written, the audit row is
  written;
- the operator is shown a 500, with the 发货 modal still open and the tracking
  number still in it;
- the obvious operator response is to ship it again, which now fails with
  `ORDER_NOT_SHIPPABLE` — a second error message about an order that actually
  went out.

The same applies to 确认收货 (`completionKey`) and to **checkout**
(`autoCancelKey`): a shopper who submits an order gets the order created and
then a 500. That is the whole paid path.

The severity is blunt: on a real Redis, every one of these three writes answers
500. Nothing in the repository can see it, because every unit and integration
test builds its `Ctx` with `memoryQueue()` (`kernel/queue.ts:48`), which keeps
`dedupeKey` as a plain string in an array and never validates it. The e2e stack
is the first thing that puts a real BullMQ `Queue` behind `ctx.queue.enqueue`.

## Proposed fix

In the adapter, where the port's opaque string becomes a BullMQ id — not at the
three call sites, which should stay free to use whatever key shape reads best,
and not by rewriting them to `name-id`, which leaves the next `:` to be found in
production:

```ts
/**
 * BullMQ refuses a custom job id containing `:` (it reserves the separator for
 * its own key space). `dedupeKey` is an opaque string in the port's contract,
 * so the mapping belongs here.
 */
const toJobId = (dedupeKey: string): string => dedupeKey.replaceAll(':', '-');
```

applied in both directions — `enqueue` (`jobId: toJobId(dedupeKey)`) and
`cancel` (`queue.getJob(toJobId(dedupeKey))`), which today would silently fail
to find the job it was asked to withdraw.

Two riders:

1. `memoryQueue()` should apply the same restriction, or the suites that use it
   keep being unable to catch this class. One line in `enqueue`: reject a key
   the real adapter could not carry (`:` today), with a message naming the
   caller. Making the fake stricter than the real thing is what stops a fake
   from lying.
2. Worth a guard in `pnpm guards` once the shape is fixed — cheap, since every
   `dedupeKey` is built by a small named function — but the fake-parity check
   above is the one that actually pays.

## Test that would have caught it

`packages/core/src/kernel/queue-bullmq.int.test.ts`: a Testcontainers Redis, a
real `createBullQueue`, `enqueue('x', {}, { dedupeKey: 'order-auto-cancel:1' })`,
then assert the job is there and that a second enqueue with the same key is a
no-op — the property the adapter's own doc comment claims and nothing verifies.
`cancel()` on the same key belongs in it too.
