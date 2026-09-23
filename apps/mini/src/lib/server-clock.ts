/**
 * The server's clock, as far as this phone knows it (design.md §4.4 Countdown: never trust the
 * phone's time for a deadline). `offset` = server − phone, in ms; 0 until something reports the
 * server's time. TODO(backend gap): `app/config` does not carry `serverTime` yet.
 */
let offset = 0;

export function setServerTime(serverMs: number, receivedAtMs: number = Date.now()): void {
  offset = serverMs - receivedAtMs;
}

/** Now, on the server's clock. */
export function serverNow(): number {
  return Date.now() + offset;
}
