import type { DbOrTx } from '@shop/db';

/**
 * 累计订单 / 累计消费 for a customer, without this domain reading `orders`.
 *
 * The staff 用户 screen shows two numbers that are not the user domain's to
 * compute: how many orders a customer has paid for, and what they came to. The
 * import boundary forbids `user.repo.ts` from touching the order tables, and
 * the boundary is not bureaucracy here — every rule about which orders "count"
 * (a refunded one does not, a 待付款 one does not, a group-buy that never 成团
 * does not) lives in the order aggregate and changes there. A join written
 * from this side would be a second, silently diverging definition of 消费总额.
 *
 * So it is a port, in the shape of the ports the order aggregate already
 * publishes (`order/ports.ts`), with two differences that are deliberate:
 *
 * - it is declared **here**, by the consumer, not in `order/ports.ts`. This
 *   domain is the one that knows what it needs; the order domain implements an
 *   interface it can read in one screen rather than having its own port file
 *   grown by somebody else.
 * - it is **optional**. `getUserOrderStatsPort()` returns `undefined` while
 *   nothing has registered an implementation, and the staff routes answer
 *   `orderCount: null, spendTotal: null` rather than `0`. Nothing else in this
 *   system is allowed to fail soft, but the alternatives here are both worse: a
 *   500 would take down the whole 用户 screen over two decorative numbers, and
 *   a hard `0` would tell a 店员 that a customer with forty orders is a
 *   first-time buyer. `null` says "not known", and the contract tells clients
 *   to render 「--」.
 *
 * `order/index.ts` registers it when the order domain loads; the tests here pin
 * the behaviour on the fake below.
 */

export interface UserOrderStats {
  /** Orders that were paid for and not fully refunded. */
  orderCount: number;
  /** What those orders actually took from the customer, as `Money` prints it: `"3980.00"`. */
  spendTotal: string;
}

export interface UserOrderStatsPort {
  /**
   * One round trip for a page of customers.
   *
   * Batched because the list route asks for twenty at a time and a per-row
   * call is how a customer list becomes twenty-one queries. A user with no
   * qualifying orders may be absent from the map or present as zeroes; the
   * caller treats both as `{ orderCount: 0, spendTotal: '0.00' }`.
   */
  statsFor(db: DbOrTx, userIds: readonly number[]): Promise<Map<number, UserOrderStats>>;
}

let port: UserOrderStatsPort | undefined;

export function registerUserOrderStatsPort(impl: UserOrderStatsPort): void {
  port = impl;
}

/** `undefined` while no domain has registered one — see the note above. */
export function getUserOrderStatsPort(): UserOrderStatsPort | undefined {
  return port;
}

/** Test helper. Never call this from app code. */
export function resetUserOrderStatsPort(): void {
  port = undefined;
}

// ---------------------------------------------------------------------------
// fake
// ---------------------------------------------------------------------------

export interface FakeUserOrderStatsPort extends UserOrderStatsPort {
  set(userId: number, stats: UserOrderStats): void;
  /** Ids the port was asked about, newest call last — a list route must ask once. */
  readonly calls: number[][];
  reset(): void;
}

/**
 * An in-memory implementation for tests, here rather than in `@shop/testing`
 * for the reason `fakeWechatIdentityPort` is: `@shop/testing` holds only
 * cross-domain fakes, and this one serves this domain's tests alone.
 */
export function fakeUserOrderStatsPort(): FakeUserOrderStatsPort {
  const stats = new Map<number, UserOrderStats>();
  const calls: number[][] = [];
  return {
    calls,
    statsFor(_db, userIds) {
      calls.push([...userIds]);
      const found = new Map<number, UserOrderStats>();
      for (const userId of userIds) {
        const row = stats.get(userId);
        if (row) found.set(userId, row);
      }
      return Promise.resolve(found);
    },
    set: (userId, row) => void stats.set(userId, row),
    reset() {
      stats.clear();
      calls.length = 0;
    },
  };
}
