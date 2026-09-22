import { describe, expect, it } from 'vitest';

import { coerceToExpected, isCoercibleType } from './coerce';

describe('coerceToExpected — number', () => {
  it('转换旧库里那种 JSON 编码过的数字字符串', () => {
    expect(coerceToExpected('5', 'number')).toBe(5);
    expect(coerceToExpected('0', 'number')).toBe(0);
    expect(coerceToExpected('-3', 'number')).toBe(-3);
    expect(coerceToExpected('19.90', 'number')).toBe(19.9);
  });

  it('带单位或者有杂质的字符串不猜，交给人看', () => {
    // 这些在旧库里真实出现过：运营在输入框里连单位一起填了。
    // 猜成 5 比报错更糟——商城会带着一个没人知道被改过的阈值上线。
    for (const value of ['5 件', '五', 'abc', '5,000', '5%', '>5']) {
      expect(coerceToExpected(value, 'number')).toBeUndefined();
    }
  });

  it('两侧的空白是无歧义的，去掉就行', () => {
    expect(coerceToExpected(' 5', 'number')).toBe(5);
    expect(coerceToExpected('5 ', 'number')).toBe(5);
  });

  it('空字符串不变成 0', () => {
    // 旧系统的"没设置"就是空字符串，而 0 是一个真实的阈值。
    // 把前者变成后者是在悄悄改变含义。
    expect(coerceToExpected('', 'number')).toBeUndefined();
    expect(coerceToExpected('   ', 'number')).toBeUndefined();
  });

  it('不接受会被 Number() 意外接受的写法', () => {
    for (const value of ['0x10', '1e5', 'Infinity', '-Infinity', 'NaN', '01']) {
      expect(coerceToExpected(value, 'number')).toBeUndefined();
    }
  });

  it('布尔值不会变成 1 或 0', () => {
    expect(coerceToExpected(true, 'number')).toBeUndefined();
    expect(coerceToExpected(false, 'number')).toBeUndefined();
  });

  it('已经是数字就不用管', () => {
    expect(coerceToExpected(5, 'number')).toBeUndefined();
  });
});

describe('coerceToExpected — boolean', () => {
  it('只认旧系统真正写过的两种写法', () => {
    expect(coerceToExpected('1', 'boolean')).toBe(true);
    expect(coerceToExpected('0', 'boolean')).toBe(false);
    expect(coerceToExpected(1, 'boolean')).toBe(true);
    expect(coerceToExpected(0, 'boolean')).toBe(false);
  });

  it('其它写法一律不猜', () => {
    // 猜错一个布尔值 = 悄悄打开一个功能（比如某个支付方式）。
    for (const value of ['true', 'false', 'yes', 'on', '是', '', '2', '-1']) {
      expect(coerceToExpected(value, 'boolean')).toBeUndefined();
    }
  });
});

describe('coerceToExpected — string / bigint', () => {
  it('数字和布尔可以变成字符串', () => {
    expect(coerceToExpected(5, 'string')).toBe('5');
    expect(coerceToExpected(true, 'string')).toBe('true');
  });

  it('已经是字符串就不用管', () => {
    expect(coerceToExpected('x', 'string')).toBeUndefined();
  });

  it('整数字符串可以变成 bigint，小数不行', () => {
    expect(coerceToExpected('900000000000000001', 'bigint')).toBe(900000000000000001n);
    expect(coerceToExpected('1.5', 'bigint')).toBeUndefined();
    expect(coerceToExpected('', 'bigint')).toBeUndefined();
  });
});

describe('coerceToExpected — null 与未知类型', () => {
  it('null 和 undefined 原样放行', () => {
    expect(coerceToExpected(null, 'number')).toBeUndefined();
    expect(coerceToExpected(undefined, 'number')).toBeUndefined();
  });

  it('对象和数组不转换', () => {
    expect(coerceToExpected({}, 'number')).toBeUndefined();
    expect(coerceToExpected([1], 'string')).toBeUndefined();
  });
});

describe('isCoercibleType', () => {
  it('认得 zod 报的四种基础类型', () => {
    expect(isCoercibleType('number')).toBe(true);
    expect(isCoercibleType('boolean')).toBe(true);
    expect(isCoercibleType('string')).toBe(true);
    expect(isCoercibleType('bigint')).toBe(true);
  });

  it('其它一律不碰', () => {
    for (const value of ['object', 'array', 'date', 'union', undefined, null, 42]) {
      expect(isCoercibleType(value)).toBe(false);
    }
  });
});
