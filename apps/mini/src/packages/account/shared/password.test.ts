import { describe, expect, it } from 'vitest';
import { checkNewPassword } from './password';

describe('checkNewPassword', () => {
  it('wants 6 to 64 characters, then the same twice', () => {
    expect(checkNewPassword({ password: '12345', confirm: '12345' })).toEqual({
      password: '密码为 6–64 位',
    });
    expect(checkNewPassword({ password: '123456', confirm: '123457' })).toEqual({
      confirm: '两次输入的密码不一致',
    });
    expect(checkNewPassword({ password: '123456', confirm: '123456' })).toEqual({});
  });
});
