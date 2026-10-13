import { createHash, randomUUID } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../common/errors.js';

export interface AccessPayload {
  sub: number;
  username: string;
}

export interface RefreshPayload {
  sub: number;
  jti: string;
}

export function signAccessToken(payload: { id: number; username: string }): string {
  const body: AccessPayload = { sub: payload.id, username: payload.username };
  return jwt.sign(body, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL } as SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as unknown as AccessPayload;
    if (!decoded?.sub) throw new Error('payload 缺少 sub');
    return decoded;
  } catch {
    throw AppError.unauthorized('登录状态无效或已过期，请重新登录');
  }
}

export function signRefreshToken(userId: number): { token: string; jti: string; expiresAt: Date } {
  const jti = randomUUID();
  const body: RefreshPayload = { sub: userId, jti };
  const token = jwt.sign(body, env.JWT_REFRESH_SECRET, { expiresIn: env.REFRESH_TOKEN_TTL } as SignOptions);
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
  return { token, jti, expiresAt };
}

export function verifyRefreshToken(token: string): RefreshPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as unknown as RefreshPayload;
    if (!decoded?.sub || !decoded?.jti) throw new Error('payload 不完整');
    return decoded;
  } catch {
    throw AppError.unauthorized('刷新令牌无效或已过期，请重新登录');
  }
}

/** refresh token 只存哈希，泄露数据库也无法直接使用 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
