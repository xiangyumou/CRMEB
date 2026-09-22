import { describe, expect, it } from 'vitest';

import { describeValue, describeValues, redactUrl } from './secrets';

describe('describeValue', () => {
  it('says only whether a value is there', () => {
    expect(describeValue('super-secret-key')).toBe('<set>');
    expect(describeValue('')).toBe('<empty>');
    expect(describeValue('   ')).toBe('<empty>');
    expect(describeValue(null)).toBe('<empty>');
    expect(describeValue(undefined)).toBe('<empty>');
  });

  it('treats 0 and false as configured values, not as absence', () => {
    expect(describeValue(0)).toBe('<set>');
    expect(describeValue(false)).toBe('<set>');
  });

  it('treats an empty list or object as absence', () => {
    expect(describeValue([])).toBe('<empty>');
    expect(describeValue({})).toBe('<empty>');
    expect(describeValue(['a'])).toBe('<set>');
  });
});

describe('describeValues', () => {
  it('leaves no value behind, whatever the key is called', () => {
    const described = describeValues({
      merchantPrivateKey: '-----BEGIN PRIVATE KEY-----\nMIIE…',
      apiV3Key: 'a'.repeat(32),
      siteName: 'CRMEB 商城',
      emptyOne: '',
    });
    expect(described).toEqual({
      apiV3Key: '<set>',
      emptyOne: '<empty>',
      merchantPrivateKey: '<set>',
      siteName: '<set>',
    });
    // The rendered form of the whole report holds none of the inputs. This is
    // the assertion that matters: a per-field "is this secret?" list leaks on
    // the first key nobody added to it.
    const rendered = JSON.stringify(described);
    expect(rendered).not.toContain('BEGIN PRIVATE KEY');
    expect(rendered).not.toContain('aaaa');
    expect(rendered).not.toContain('CRMEB');
  });

  it('sorts the keys so two runs produce the same report', () => {
    expect(Object.keys(describeValues({ b: 1, a: 1, c: 1 }))).toEqual(['a', 'b', 'c']);
  });
});

describe('redactUrl', () => {
  it('removes the password from a connection string', () => {
    const redacted = redactUrl('mysql://crmeb:hunter2@db.internal:3306/crmeb');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('crmeb:');
    expect(redacted).toContain('db.internal:3306');
  });

  it('leaves a credential-free url readable', () => {
    expect(redactUrl('postgres://db:5432/shop')).toContain('db:5432');
  });

  it('reduces something it cannot parse to its scheme, rather than echoing it', () => {
    expect(redactUrl('mysql://crmeb:hunter2@[not-an-address]/db')).toBe('mysql://***');
    expect(redactUrl('hunter2')).toBe('***');
  });
});
