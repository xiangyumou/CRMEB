/**
 * `CONTRACT-PENDING` markers that name a stream which has already merged.
 *
 * Stream H wrote them before the routing decision was taken. The first pass of
 * this list re-pointed them at **stream S** ("storefront contract gaps"); S has
 * since merged, and 34 of the calls it was supposed to cover still have no
 * route. They are not S's any more and they were never really A's, B1's, E1's
 * or F1's: the uni-app API layer is **H2**'s (second pass, dispatched
 * 2026-09-23, `STATUS.md`), and the next uni-app pass (H3 now) has to do one of two things to each entry —
 * get the contract written, or delete the call, because a call the app cannot
 * make is not a pending contract, it is dead code.
 *
 * Written down per URL and exactly compared: when a route lands, the `uniapp`
 * check already fails with "marked pending but the route exists", and this list
 * additionally fails when an entry matches no marked call any more. The list can
 * only shrink. **CR-6-k** carries the request to H2.
 */

export interface Reassignment {
  /** Stream the marker names. */
  marked: string;
  /** Method and normalised path of the call. */
  method: string;
  url: string;
  /** Stream that actually owes it. */
  owedBy: string;
  why: string;
}

/**
 * Empty since H3 (2026-09-23): every marker this list re-pointed has been
 * deleted — bound to the route that landed, re-pointed at the route that
 * replaced it, or removed with the call. Kept, with its check, so a future
 * stale marker has somewhere to be written down; it can still only shrink.
 */
export const MARKER_REASSIGNMENTS: readonly Reassignment[] = [];

export function reassignmentFor(
  marked: string,
  method: string,
  url: string,
): Reassignment | undefined {
  return MARKER_REASSIGNMENTS.find(
    (entry) => entry.marked === marked && entry.method === method && entry.url === url,
  );
}
