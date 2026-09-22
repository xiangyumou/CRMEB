import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

/**
 * The Official Account callback's signature check and AES envelope.
 *
 * Pure functions, no `Ctx`, no I/O — so the vectors in `wechat-oa.crypto.test.ts`
 * are the real thing rather than a mock of it. Everything that decides *whether*
 * to trust a callback lives here; `wechat-oa.webhook.service.ts` decides what to
 * do with one that is trusted.
 *
 * ## Why the signature is checked before the body is parsed
 *
 * The callback URL is public and has to be: WeChat calls it from its own
 * addresses and publishes no stable list. So the URL is the authentication
 * boundary, and the only thing standing between the open internet and a "this
 * user just subscribed, give them the new-customer coupon" event is this file.
 *
 * `verifySignature` therefore runs on the raw query string, before any XML is
 * looked at, and in safe mode `verifyMessageSignature` runs on the still
 * encrypted `Encrypt` element before it is decrypted. The legacy
 * `wechat/serve` parsed the XML first and checked the signature inside the SDK
 * afterwards, which is how a malformed body became a 500 that WeChat then
 * retried three times.
 *
 * ## Modes
 *
 * WeChat has three (明文 / 兼容 / 安全) and the mode is *not* read from config
 * here. The request says which one it is: a callback carrying `encrypt_type=aes`
 * and a `msg_signature` is encrypted, everything else is plain. A reply is then
 * encrypted exactly when the request was, which is correct in all three modes
 * and cannot drift out of step with a setting somebody changed in 公众平台 but
 * not in our admin.
 */

// ---------------------------------------------------------------------------
// signature
// ---------------------------------------------------------------------------

/** `sha1(sort(parts).join(''))` — WeChat's scheme for both signature flavours. */
export function signatureOf(parts: readonly string[]): string {
  return createHash('sha1')
    .update([...parts].sort().join(''), 'utf8')
    .digest('hex');
}

/** Constant-time compare of two hex digests. */
export function equalsSignature(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(actual, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * The URL-verification and plain-mode signature: `signature` over
 * `token`, `timestamp`, `nonce`.
 */
export function verifySignature(args: {
  token: string;
  signature: string;
  timestamp: string;
  nonce: string;
}): boolean {
  if (args.token === '') return false;
  return equalsSignature(signatureOf([args.token, args.timestamp, args.nonce]), args.signature);
}

/**
 * The safe-mode signature: `msg_signature` over `token`, `timestamp`, `nonce`
 * **and the ciphertext**.
 *
 * Binding the ciphertext is the whole point. Without it the three plain
 * parameters could be replayed verbatim against a body of the attacker's
 * choosing, and the decrypt step would then be the only check left — which it
 * cannot be, because a wrong key fails as garbage rather than as a refusal.
 */
export function verifyMessageSignature(args: {
  token: string;
  msgSignature: string;
  timestamp: string;
  nonce: string;
  encrypt: string;
}): boolean {
  if (args.token === '') return false;
  return equalsSignature(
    signatureOf([args.token, args.timestamp, args.nonce, args.encrypt]),
    args.msgSignature,
  );
}

// ---------------------------------------------------------------------------
// the AES envelope
// ---------------------------------------------------------------------------

export class WechatOaCryptoError extends Error {
  constructor(
    readonly reason:
      'bad-aes-key' | 'bad-ciphertext' | 'bad-padding' | 'bad-length' | 'appid-mismatch',
  ) {
    super(`wechat-oa crypto: ${reason}`);
    this.name = 'WechatOaCryptoError';
  }
}

/**
 * WeChat's `EncodingAESKey` is 43 base64 characters of a 32-byte key with the
 * trailing `=` chopped off. The IV is the key's own first 16 bytes — not a
 * choice we get to make, and not one worth hiding behind a constant.
 */
export function aesKeyOf(encodingAesKey: string): { key: Buffer; iv: Buffer } {
  const trimmed = encodingAesKey.trim();
  if (trimmed.length !== 43) throw new WechatOaCryptoError('bad-aes-key');
  const key = Buffer.from(`${trimmed}=`, 'base64');
  if (key.length !== 32) throw new WechatOaCryptoError('bad-aes-key');
  return { key, iv: key.subarray(0, 16) };
}

/**
 * WeChat pads to a 32-byte boundary, not to AES's own 16.
 *
 * So the cipher runs with `setAutoPadding(false)` and the padding is removed
 * here; letting Node strip it would silently truncate a message whose padding
 * happens to be 17–32 bytes.
 */
const BLOCK_SIZE = 32;

function unpad(buffer: Buffer): Buffer {
  const pad = buffer[buffer.length - 1] ?? 0;
  if (pad < 1 || pad > BLOCK_SIZE || pad > buffer.length)
    throw new WechatOaCryptoError('bad-padding');
  return buffer.subarray(0, buffer.length - pad);
}

function pad(buffer: Buffer): Buffer {
  const amount = BLOCK_SIZE - (buffer.length % BLOCK_SIZE);
  return Buffer.concat([buffer, Buffer.alloc(amount, amount)]);
}

/**
 * Decrypts one `Encrypt` element.
 *
 * The plaintext is `16 random bytes | 4-byte big-endian length | message |
 * appid`. The appid at the end is checked against ours: it is what stops a
 * message encrypted for a *different* Official Account — one whose operator
 * happens to have our callback URL — from being processed as ours.
 */
export function decryptMessage(args: {
  encodingAesKey: string;
  appId: string;
  encrypted: string;
}): string {
  const { key, iv } = aesKeyOf(args.encodingAesKey);

  let raw: Buffer;
  try {
    const cipherText = Buffer.from(args.encrypted, 'base64');
    if (cipherText.length === 0 || cipherText.length % 16 !== 0) {
      throw new WechatOaCryptoError('bad-ciphertext');
    }
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    raw = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  } catch (error) {
    if (error instanceof WechatOaCryptoError) throw error;
    throw new WechatOaCryptoError('bad-ciphertext');
  }

  const body = unpad(raw);
  if (body.length < 20) throw new WechatOaCryptoError('bad-length');

  const length = body.readUInt32BE(16);
  if (length < 0 || 20 + length > body.length) throw new WechatOaCryptoError('bad-length');

  const message = body.subarray(20, 20 + length).toString('utf8');
  const appId = body.subarray(20 + length).toString('utf8');
  if (args.appId !== '' && appId !== args.appId) throw new WechatOaCryptoError('appid-mismatch');
  return message;
}

/** The inverse, for the encrypted reply. `random` is injectable so a test can pin the output. */
export function encryptMessage(args: {
  encodingAesKey: string;
  appId: string;
  message: string;
  random?: Buffer;
}): string {
  const { key, iv } = aesKeyOf(args.encodingAesKey);
  const message = Buffer.from(args.message, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(message.length, 0);

  const body = pad(
    Buffer.concat([
      args.random ?? randomBytes(16),
      length,
      message,
      Buffer.from(args.appId, 'utf8'),
    ]),
  );
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(body), cipher.final()]).toString('base64');
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/**
 * A deliberately tiny XML reader for a deliberately tiny XML dialect.
 *
 * A callback body is one flat `<xml>` element of scalar children, half of them
 * `<![CDATA[…]]>`. A general parser would bring an external-entity surface, a
 * dependency and a billion-laughs bomb to a problem that is one regular
 * expression — and the body arrives from the open internet before the signature
 * has been checked in exactly one case (it has not; the signature is checked
 * first, and this runs after).
 *
 * Nested elements are not supported because the dialect has none, except
 * `<ScanCodeInfo>` on a scan event, which we do not use.
 */
const ELEMENT = /<([A-Za-z0-9_]+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;

export function parseXml(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Limit the damage a pathological body can do: WeChat's own cap is 2 KB-ish.
  const source = xml.length > 64 * 1024 ? xml.slice(0, 64 * 1024) : xml;
  for (const match of source.matchAll(ELEMENT)) {
    const name = match[1];
    if (name === undefined || name === 'xml') continue;
    out[name] = match[2] ?? match[3] ?? '';
  }
  return out;
}

/** CDATA-wraps every string value; a number is written bare, as WeChat writes `CreateTime`. */
export function cdata(value: string): string {
  // `]]>` inside CDATA would close it early. Splitting it across two sections is
  // the only escape CDATA has.
  return `<![CDATA[${value.replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

/**
 * Builds one flat `<xml>` element.
 *
 * `nested` is appended verbatim for the handful of replies that carry a child
 * element (`<Image><MediaId>…`), which is not worth a tree model for.
 */
export function buildXml(fields: Record<string, string | number | undefined>, nested = ''): string {
  const body = Object.entries(fields)
    .flatMap(([key, value]) => {
      if (value === undefined) return [];
      return [
        typeof value === 'number'
          ? `<${key}>${value}</${key}>`
          : `<${key}>${cdata(value)}</${key}>`,
      ];
    })
    .join('');
  return `<xml>${body}${nested}</xml>`;
}

/** Wraps a plain reply in the safe-mode envelope, signature and all. */
export function encryptReply(args: {
  token: string;
  encodingAesKey: string;
  appId: string;
  message: string;
  timestamp: string;
  nonce: string;
  random?: Buffer;
}): string {
  const encrypt = encryptMessage({
    encodingAesKey: args.encodingAesKey,
    appId: args.appId,
    message: args.message,
    ...(args.random === undefined ? {} : { random: args.random }),
  });
  return buildXml({
    Encrypt: encrypt,
    MsgSignature: signatureOf([args.token, args.timestamp, args.nonce, encrypt]),
    TimeStamp: args.timestamp,
    Nonce: args.nonce,
  });
}
