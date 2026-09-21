// Node >= 22 removed the long-deprecated `util.is*` type predicates. The uni-app
// 2.0 toolchain still calls them — `postcss-urlrewrite`, reached through
// `@dcloudio/uni-cli-shared/lib/url-loader`, does `util.isRegExp(...)` while it
// validates its config, and the mp-weixin build dies before webpack even starts.
//
// Restoring them is the whole fix. `util.types` has the real implementations, so
// nothing here changes behaviour on a Node old enough not to need it.
//
// Loaded by the build scripts in package.json via NODE_OPTIONS=--require.
const util = require('util');

const shims = {
  isRegExp: (v) => util.types.isRegExp(v),
  isDate: (v) => util.types.isDate(v),
  isArray: Array.isArray,
  isBoolean: (v) => typeof v === 'boolean',
  isFunction: (v) => typeof v === 'function',
  isNull: (v) => v === null,
  isNullOrUndefined: (v) => v == null,
  isNumber: (v) => typeof v === 'number',
  isObject: (v) => v !== null && typeof v === 'object',
  isPrimitive: (v) => v === null || (typeof v !== 'object' && typeof v !== 'function'),
  isString: (v) => typeof v === 'string',
  isSymbol: (v) => typeof v === 'symbol',
  isUndefined: (v) => v === undefined,
};

for (const name of Object.keys(shims)) {
  if (typeof util[name] !== 'function') util[name] = shims[name];
}
