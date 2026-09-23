# CR-1-e4 — a stream that lands a contract cannot delete the uni-app marker that waited for it

**Status (R5 sweep, 2026-09-23): RESOLVED** — `MARKER_REASSIGNMENTS` in `next/guards` is empty (H3, `503fbcf35`): the markers moved to their owners. The status line below is kept as history.

- **Stream:** E4 (user & WeChat follow-up)
- **Status:** worked around in `next/guards`; the markers themselves are still H2's
- **Affects:** `next/guards/src/checks/uniapp.ts` (K), `template/uni-app/api/*.js` (H2)

## What happened

`pnpm guards`' `uniapp` check fails a call that carries a
`CONTRACT-PENDING(<stream>)` marker once the route it names exists: the marker
has outlived its reason and should be deleted. That is right when the stream
that wrote the marker is the stream that lands the route.

It is not right here. E4's brief lands four routes the uni-app already calls
behind markers naming streams that merged long ago — `POST
/api/v1/auth/phone/wechat-mini` (marked `E1`), `GET /api/v1/wechat/mini-qrcodes`
(marked `E2`), and the 店员 reads (marked `A`) — and every one of them is
already on `MARKER_REASSIGNMENTS`, the list that records "this marker names a
merged stream; **H2** owns the line now" (CR-6-k). E4's brief scopes
`template/uni-app` out explicitly, and its instructions forbid touching that
tree at all, so the one edit that would clear the failure is the one edit the
stream may not make.

So: landing the contract turned a *pending H2 item* into a *hard failure that
nobody in flight is allowed to fix*, on a check the orchestrator asked every
stream to keep green.

## What changed

In the "route exists but the call is still marked" branch, a call that is
already on `MARKER_REASSIGNMENTS` now produces `pending(H2)` instead of `fail`,
with the message saying the route has landed and the marker is H2's to delete.
Everything else is untouched: an unlisted stale marker still fails, the
reassignment list is still exactly compared, and the list can still only
shrink — H2 deleting the marker removes the pending item and then the entry.

## What needs deciding

Nothing, for E4. For H2: these entries are now the clearest kind of work item
on that list — the contract exists, the call is live, only the comment is
stale. Deleting those markers is a pure win and the reassignment entries go
with them.
