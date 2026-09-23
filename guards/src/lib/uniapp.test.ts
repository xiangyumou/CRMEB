import { describe, expect, it } from 'vitest';
import {
  exportedStringList,
  extractCalls,
  importsOf,
  isLocal,
  normaliseUrl,
  preprocess,
  scriptOf,
} from './uniapp';

/**
 * The readers the uni-app check stands on. They are pure, so they are tested
 * here against small strings rather than against the app: a reader that is
 * wrong in the lenient direction lets a broken screen through, and one wrong in
 * the strict direction fails a file that is fine.
 */

describe('normaliseUrl', () => {
  it('turns an interpolation into :param', () => {
    expect(normaliseUrl('/api/v1/orders/${id}/cancel')).toBe('/api/v1/orders/:param/cancel');
  });

  it('matches nested braces by hand', () => {
    expect(normaliseUrl('/api/v1/users/${(data || {}).id}/coupons')).toBe(
      '/api/v1/users/:param/coupons',
    );
  });

  it('leaves a plain URL alone', () => {
    expect(normaliseUrl('/api/v1/cart')).toBe('/api/v1/cart');
  });
});

describe('extractCalls', () => {
  it('reads the verb, the line and the normalised URL', () => {
    const source = `
export function cart() {
  return request.get('/api/v1/cart');
}

export function cancel(id) {
  return request.post(\`/api/v1/orders/\${id}/cancel\`, {});
}
`;
    expect(extractCalls('api/x.js', source)).toEqual([
      { file: 'api/x.js', line: 3, method: 'GET', url: '/api/v1/cart' },
      { file: 'api/x.js', line: 7, method: 'POST', url: '/api/v1/orders/:param/cancel' },
    ]);
  });

  it('is not confused by a second call on the next line', () => {
    const source = [
      "export const a = () => request.delete('/api/v1/addresses/1');",
      "export const b = () => request.put('/api/v1/addresses/1');",
    ].join('\n');
    expect(extractCalls('api/y.js', source).map((c) => c.method)).toEqual(['DELETE', 'PUT']);
  });
});

describe('preprocess', () => {
  const source = [
    'common();',
    '// #ifdef H5',
    'webOnly();',
    '// #endif',
    '// #ifdef MP',
    'miniOnly();',
    '// #endif',
    '// #ifndef H5',
    'notWeb();',
    '// #else',
    'web();',
    '// #endif',
    '<!-- #ifdef H5 || MP-WEIXIN -->',
    'both();',
    '<!-- #endif -->',
    '/* #ifdef APP-PLUS */',
    'app();',
    '/* #endif */',
  ].join('\n');

  it('keeps what H5 compiles', () => {
    expect(preprocess(source, 'H5').split('\n')).toEqual([
      'common();',
      'webOnly();',
      'web();',
      'both();',
    ]);
  });

  it('keeps what the WeChat mini-program compiles, with MP covering MP-WEIXIN', () => {
    expect(preprocess(source, 'MP-WEIXIN').split('\n')).toEqual([
      'common();',
      'miniOnly();',
      'notWeb();',
      'both();',
    ]);
  });

  it('keeps an inner block off when its outer block is off', () => {
    const nested = ['// #ifdef APP-PLUS', '// #ifdef H5', 'never();', '// #endif', '// #endif'];
    expect(preprocess(nested.join('\n'), 'H5')).toBe('');
  });
});

describe('scriptOf', () => {
  it('takes the script blocks of a .vue file and the whole of a .js file', () => {
    const vue = '<template><view/></template>\n<script>\nimport a from "./a";\n</script>';
    expect(scriptOf('x.vue', vue).trim()).toBe('import a from "./a";');
    expect(scriptOf('x.js', 'import b from "./b";')).toBe('import b from "./b";');
  });
});

describe('importsOf', () => {
  it('reads import-from, export-from and bare imports', () => {
    const script = [
      "import request from '@/utils/request.js';",
      "import { a, b } from '../api/order';",
      "export * from './shared';",
      "import './side-effect.css';",
      "import dayjs from 'dayjs';",
    ].join('\n');
    expect(importsOf(script).sort()).toEqual(
      ['../api/order', './shared', './side-effect.css', '@/utils/request.js', 'dayjs'].sort(),
    );
  });

  it('does not count a commented-out import', () => {
    const script = "// import gone from './gone';\n/* import alsoGone from './also'; */\n";
    expect(importsOf(script)).toEqual([]);
  });

  it('tells local specifiers from packages', () => {
    expect(['./a', '../b', '@/c', 'vue', '@dcloudio/uni-app'].map(isLocal)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
  });
});

describe('exportedStringList', () => {
  it('reads the strings of an exported array', () => {
    const source = 'export const names = [\n  \'banner\',\n  "search",\n];\n';
    expect(exportedStringList(source, 'names')).toEqual(['banner', 'search']);
  });

  it('is null when the list is not exported', () => {
    expect(exportedStringList('const names = [];', 'names')).toBeNull();
  });
});
