import { describe, expect, it } from 'vitest';
import { redactPayload } from './audit.repo';

/**
 * K-SEC-U12 (CR-9-k), pinned.
 *
 * `redactPayload` strips its list of keys at the top level only, and
 * `configSaveBody` nests every field under `values` — so
 * `PUT /admin-api/system/config/payment` writes the merchant private key and
 * the APIv3 key into `audit_logs` in the clear, where anybody holding the
 * audit-log read atom can read them. The `it.fails` flips when CR-9-k lands.
 */

const API_V3_KEY = 'APIV3-MARKER-0123456789abcdef0123';
const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----MARKER';

describe('K-SEC-U12 — what the operation log keeps of a request body', () => {
  it('redacts a credential at the top level', () => {
    const written = redactPayload({ account: 'ops', password: 'hunter2-marker' });
    expect(written).not.toContain('hunter2-marker');
    expect(written).toContain('ops');
  });

  it.fails('redacts the same credential one level down, as the config form sends it', () => {
    const written = redactPayload({
      values: { mchId: '1900000109', apiV3Key: API_V3_KEY, merchantPrivateKey: PRIVATE_KEY },
    });
    expect(written).not.toContain(API_V3_KEY);
    expect(written).not.toContain(PRIVATE_KEY);
  });
});
