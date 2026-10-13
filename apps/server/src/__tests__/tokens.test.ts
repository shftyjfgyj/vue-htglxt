import { describe, expect, it } from 'vitest';
import { AppError } from '../common/errors.js';
import { hashToken, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../utils/tokens.js';

describe('token 工具', () => {
  it('access token 签发与校验可还原用户信息', () => {
    const token = signAccessToken({ id: 7, username: 'admin' });
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(7);
    expect(payload.username).toBe('admin');
  });

  it('被篡改的 access token 抛出 401 业务异常', () => {
    const token = signAccessToken({ id: 7, username: 'admin' });
    expect(() => verifyAccessToken(token + 'x')).toThrowError(AppError);
    try {
      verifyAccessToken(token + 'x');
    } catch (error) {
      expect((error as AppError).status).toBe(401);
    }
  });

  it('refresh token 每次带不同 jti，哈希稳定可落库比对', () => {
    const first = signRefreshToken(3);
    const second = signRefreshToken(3);
    expect(first.jti).not.toBe(second.jti);
    expect(verifyRefreshToken(first.token).sub).toBe(3);
    expect(hashToken(first.token)).toBe(hashToken(first.token));
    expect(hashToken(first.token)).toHaveLength(64);
  });
});
