import { describe, expect, it } from 'vitest';
import { hashPassword, isStrongPassword, verifyPassword } from '../utils/password.js';

describe('password 工具', () => {
  it('哈希后可以用明文校验通过', async () => {
    const hash = await hashPassword('Admin@123456');
    expect(hash).not.toBe('Admin@123456');
    expect(hash.startsWith('$2')).toBe(true);
    await expect(verifyPassword('Admin@123456', hash)).resolves.toBe(true);
  });

  it('错误密码校验失败', async () => {
    const hash = await hashPassword('Admin@123456');
    await expect(verifyPassword('admin@123456', hash)).resolves.toBe(false);
  });

  it('密码强度校验', () => {
    expect(isStrongPassword('abc12345')).toBe(true);
    expect(isStrongPassword('abcdefgh')).toBe(false);
    expect(isStrongPassword('12345678')).toBe(false);
    expect(isStrongPassword('a1')).toBe(false);
  });
});
