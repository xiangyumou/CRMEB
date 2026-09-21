import { describe, expect, it } from 'vitest';
import type { Ctx } from '../kernel/context';
import { refundConfig, returnAddress, type RefundConfig } from './refund.config';

/**
 * The `refund` config group.
 *
 * The same two rules the `payment` and `wechat` groups are held to — no
 * transport-security switch, and every secret declared — restated here because
 * the boundary rule keeps each domain's tests inside its own domain, and
 * because "this group has no secrets" is a claim worth failing on the day
 * somebody adds one.
 */

const FORBIDDEN = /verif|ssl|tls|certificate_?authority|ca_?bundle|ca_?path|insecure|allow_?self/i;

describe('TLS-001 — no verification switch in `refund`', () => {
  it('has none in the schema', () => {
    expect(Object.keys(refundConfig.schema.shape).filter((key) => FORBIDDEN.test(key))).toEqual([]);
  });

  it('has none on the form', () => {
    expect(Object.keys(refundConfig.ui ?? {}).filter((key) => FORBIDDEN.test(key))).toEqual([]);
  });
});

describe('secret fields', () => {
  it('declares none, because the group holds none', () => {
    // A return address is printed to the buyer; there is nothing here to hide.
    // If a future field *is* a secret it must be declared, and this test is
    // where that omission surfaces.
    const ui = (refundConfig.ui ?? {}) as Record<string, { secret?: boolean } | undefined>;
    expect(Object.keys(ui).filter((key) => ui[key]?.secret === true)).toEqual([]);
  });
});

/**
 * CR-6-c, from the refund side: `config_values.value` is jsonb and drizzle
 * parses a stored string a second time on the way out, so an all-digit value
 * comes back as a number. A return phone is the field this bites first.
 */
describe('CR-6-c — a stored value that came back as a number is still a string', () => {
  it('accepts a numeric return phone and hands back the digits', () => {
    expect(refundConfig.schema.parse({ returnPhone: 13800000000 }).returnPhone).toBe('13800000000');
  });

  it('still answers the defaults for an unconfigured shop', () => {
    const parsed = refundConfig.schema.parse({});
    expect(parsed.returnName).toBe('');
    expect(parsed.afterSaleDays).toBe(0);
  });
});

describe('returnAddress', () => {
  const ctxWith = (config: Partial<RefundConfig>): Ctx =>
    ({
      config: { get: async () => refundConfig.schema.parse(config) },
    }) as unknown as Ctx;

  const complete = {
    returnName: '售后部',
    returnPhone: '13800000000',
    returnAddress: '浙江省杭州市西湖区文一西路 1 号',
  };

  it('hands back the address once every part is configured', async () => {
    await expect(returnAddress(ctxWith(complete))).resolves.toEqual({
      name: complete.returnName,
      phone: complete.returnPhone,
      address: complete.returnAddress,
    });
  });

  it('is null — never half an address — when a part is missing', async () => {
    // A return label with a name and no street sends the parcel nowhere; an
    // empty panel at least tells the buyer to ask support.
    await expect(returnAddress(ctxWith({}))).resolves.toBeNull();
    await expect(returnAddress(ctxWith({ ...complete, returnAddress: '' }))).resolves.toBeNull();
    await expect(returnAddress(ctxWith({ ...complete, returnPhone: '' }))).resolves.toBeNull();
    await expect(returnAddress(ctxWith({ ...complete, returnName: '' }))).resolves.toBeNull();
  });
});
