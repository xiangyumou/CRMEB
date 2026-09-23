import { describe, expect, it } from 'vitest';
import { parseAliyun } from './shipping.logistics.port';

/**
 * The vendor's body, parsed. No network: the client is exercised against a fake
 * `fetch` in the integration test, and the mapping is pure and belongs here.
 */

const body = (result: unknown, status = '0') => ({ status, msg: 'ok', result });

describe('parseAliyun', () => {
  it('maps the delivery status and puts the newest trace first', () => {
    const parsed = parseAliyun(
      body({
        deliverystatus: '2',
        issign: '0',
        list: [
          { time: '2026-06-01 09:00:00', status: '快件已到达杭州' },
          { time: '2026-06-02 08:00:00', status: '快递员正在派件' },
        ],
      }),
    );
    expect(parsed.state).toBe('delivering');
    expect(parsed.traces.map((trace) => trace.context)).toEqual([
      '快递员正在派件',
      '快件已到达杭州',
    ]);
    expect(parsed.traces[0]?.at).toBeInstanceOf(Date);
  });

  it.each([
    ['0', 'in_transit'],
    ['1', 'in_transit'],
    ['2', 'delivering'],
    ['3', 'delivered'],
    ['4', 'exception'],
    ['5', 'exception'],
    ['6', 'exception'],
    ['', 'unknown'],
    ['99', 'unknown'],
  ])('maps deliverystatus %s to %s', (code, expected) => {
    expect(parseAliyun(body({ deliverystatus: code, list: [] })).state).toBe(expected);
  });

  it('answers unknown for an error body, which the vendor sends with a 200', () => {
    expect(parseAliyun(body(null, '201'))).toEqual({ state: 'unknown', traces: [] });
    expect(parseAliyun({ nonsense: true })).toEqual({ state: 'unknown', traces: [] });
    expect(parseAliyun(null)).toEqual({ state: 'unknown', traces: [] });
  });

  it('drops a trace whose timestamp cannot be read rather than emitting an Invalid Date', () => {
    const parsed = parseAliyun(
      body({
        deliverystatus: '3',
        list: [
          { time: 'not a date', status: '?' },
          { time: '2026-06-02 08:00:00', status: '已签收' },
        ],
      }),
    );
    expect(parsed.traces).toHaveLength(1);
    expect(parsed.traces[0]?.context).toBe('已签收');
  });
});
