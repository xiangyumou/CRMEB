/** `"12.30"` → 1230. Money strings from the API always have at most two decimals. */
export function toCents(money: string): number {
  const [whole = '0', fraction = ''] = money.trim().split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  return sign * (Math.abs(Number(whole)) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)));
}

/** 1230 → `"12.30"`. */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
