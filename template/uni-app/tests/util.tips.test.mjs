// `utils/util.js` `Tips` — every page's toast. Pages toast a rejected request
// as `Tips({ title: err })`; `utils/request.js` rejects with an object whose
// `msg` is the server's message (H4, found on the SMS login journey).
//
// `utils/util.js` holds uni-app conditional-compilation blocks (`// #ifdef MP`)
// that only the uni build resolves, so the module cannot be imported here: the
// test lifts `Tips` out of the source and runs exactly that function.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'utils', 'util.js'),
  'utf8',
);

function liftTips() {
  const start = SOURCE.indexOf('Tips: function (opt, to_url) {');
  expect(start).toBeGreaterThan(-1);
  const open = SOURCE.indexOf('{', start);
  let depth = 0;
  let end = open;
  for (; end < SOURCE.length; end += 1) {
    if (SOURCE[end] === '{') depth += 1;
    if (SOURCE[end] === '}') depth -= 1;
    if (depth === 0) break;
  }
  const fn = SOURCE.slice(SOURCE.indexOf('function', start), end + 1);
  return new Function('uni', `return (${fn});`);
}

let toasts;
let Tips;

beforeEach(() => {
  toasts = [];
  Tips = liftTips()({ showToast: (o) => toasts.push(o.title) });
});

describe('Tips', () => {
  it('toasts a string title as is', () => {
    Tips({ title: '发送成功' });
    expect(toasts).toEqual(['发送成功']);
  });

  it('toasts a rejected request by its message, not as an object', () => {
    Tips({
      title: { status: 400, code: 'AUTH_SMS_CODE_INVALID', message: '验证码不正确或已过期', msg: '验证码不正确或已过期' },
    });
    Tips({ title: { message: '只有 message' } });
    expect(toasts).toEqual(['验证码不正确或已过期', '只有 message']);
  });

  it('toasts nothing for an object with no message', () => {
    Tips({ title: { status: 500 } });
    expect(toasts).toEqual([]);
  });
});
