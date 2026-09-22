import { randomInt } from 'node:crypto';
import type Redis from 'ioredis';

/**
 * Verification codes in Redis, consumed **atomically**.
 *
 * The legacy implementation stored the code at `code_<phone>` and compared it
 * with `substr($code, 0, 6) != $captcha`. Three things followed from that, all
 * of them exploitable:
 *
 *  1. `register` and `reset` never deleted the key, so one code worked for its
 *     whole TTL — a code overheard once was a login for the next minute;
 *  2. there was no attempt counter, so six digits could be walked through at
 *     whatever rate the network allowed;
 *  3. one key served every purpose, so a code sent to confirm a phone change
 *     also logged you in.
 *
 * Here the scene is part of the key, the compare-and-delete is one Lua script
 * (the `GETDEL` the brief asks for, with a counter), and a wrong guess is
 * counted inside the same atomic step. Two concurrent verifications of the
 * same correct code therefore produce exactly one `ok`.
 */

export type VerifyOutcome = 'ok' | 'invalid' | 'attempts-exceeded';

export const CODE_LENGTH = 6;

/** `sms:code:<scene>:<phone>`. The scene is in the key, not in the value. */
export function codeKey(scene: string, phone: string): string {
  return `sms:code:${scene}:${phone}`;
}

/** The resend guard. Separate key, because it must outlive a consumed code. */
export function resendKey(scene: string, phone: string): string {
  return `sms:resend:${scene}:${phone}`;
}

/**
 * Six digits from a CSPRNG, uniform over `000000`–`999999`.
 *
 * `randomInt` rather than `Math.random()`: a predictable code is a login, and
 * the legacy `rand(100000, 999999)` also threw away every code starting with a
 * zero, costing a tenth of the space for nothing.
 */
export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(CODE_LENGTH, '0');
}

/**
 * Compare, consume and count, in one round trip.
 *
 *  - right code  → the key is destroyed and nobody else can use it;
 *  - wrong code  → `attempts` goes up, and the key is destroyed once the budget
 *                  is spent, so brute force costs a new SMS every `max` tries;
 *  - no key      → `invalid`, which is also what an expired or already-spent
 *                  code looks like. The caller cannot tell them apart and
 *                  neither can an attacker.
 */
const CONSUME_LUA = `
local key = KEYS[1]
local supplied = ARGV[1]
local maxAttempts = tonumber(ARGV[2])
local stored = redis.call('HGET', key, 'code')
if not stored then return 'invalid' end
if stored == supplied then
  redis.call('DEL', key)
  return 'ok'
end
local attempts = redis.call('HINCRBY', key, 'attempts', 1)
if attempts >= maxAttempts then
  redis.call('DEL', key)
  return 'attempts-exceeded'
end
return 'invalid'
`;

export interface IssueInput {
  scene: string;
  phone: string;
  code: string;
  ttlMs: number;
  resendMs: number;
}

export async function issueCode(redis: Redis, input: IssueInput): Promise<void> {
  const key = codeKey(input.scene, input.phone);
  await redis
    .multi()
    .del(key)
    .hset(key, 'code', input.code, 'attempts', '0')
    .pexpire(key, input.ttlMs)
    .set(resendKey(input.scene, input.phone), '1', 'PX', input.resendMs)
    .exec();
}

/** Undo an issue whose SMS the provider then refused, so the shopper may retry at once. */
export async function discardCode(redis: Redis, scene: string, phone: string): Promise<void> {
  await redis.del(codeKey(scene, phone), resendKey(scene, phone));
}

export async function consumeCode(
  redis: Redis,
  input: { scene: string; phone: string; code: string; maxAttempts: number },
): Promise<VerifyOutcome> {
  const outcome = await redis.eval(
    CONSUME_LUA,
    1,
    codeKey(input.scene, input.phone),
    input.code,
    String(input.maxAttempts),
  );
  return outcome === 'ok' || outcome === 'attempts-exceeded' ? outcome : 'invalid';
}

/** Milliseconds until this phone may ask for another code in this scene; 0 when it may now. */
export async function resendWaitMs(redis: Redis, scene: string, phone: string): Promise<number> {
  const ttl = await redis.pttl(resendKey(scene, phone));
  return ttl > 0 ? ttl : 0;
}
