import { describe, expect, it } from 'vitest';
import { CreateUserSchema } from '../modules/user/user.schema.js';

/**
 * 回归防护：新建用户时角色必选。
 * 之前 roleIds 可选，不选角色会静默建出「能登录但零权限」的账号。
 */

const base = { username: 'tester', password: 'Passw0rd123' };

describe('CreateUserSchema 角色必选', () => {
  it('缺少 roleIds 时拒绝', () => {
    expect(CreateUserSchema.safeParse(base).success).toBe(false);
  });

  it('roleIds 为空数组时拒绝', () => {
    const result = CreateUserSchema.safeParse({ ...base, roleIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === '请至少选择一个角色')).toBe(true);
    }
  });

  it('至少一个角色时通过', () => {
    const result = CreateUserSchema.safeParse({ ...base, roleIds: [3] });
    expect(result.success).toBe(true);
  });

  it('仍拒绝非法角色 id', () => {
    expect(CreateUserSchema.safeParse({ ...base, roleIds: [0] }).success).toBe(false);
    expect(CreateUserSchema.safeParse({ ...base, roleIds: [-1] }).success).toBe(false);
  });
});
