import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/tokens.js';
import { countBusinessEvent } from '../../common/metrics.js';

export interface AuthUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  status: number;
  roles: string[];
  permissions: string[];
}

interface UserRow extends RowDataPacket {
  id: number;
  username: string;
  password: string;
  nickname: string;
  email: string;
  avatar: string;
  status: number;
  last_login_at: string | null;
}

interface UserProfile {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
  status: number;
  roles: string[];
  permissions: string[];
  lastLoginAt: string | null;
}

/** 一次性取用户 + 角色码 + 权限码（权限码含 * 表示超级管理员） */
export async function getAuthUser(userId: number): Promise<AuthUser | null> {
  const user = await queryOne<UserRow>(
    'SELECT id, username, nickname, avatar, status FROM users WHERE id = ? AND deleted_at IS NULL',
    [userId]
  );
  if (!user) return null;

  const [roleRows, permRows] = await Promise.all([
    query<RowDataPacket & { code: string }>(
      `SELECT r.code FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.deleted_at IS NULL`,
      [userId]
    ),
    query<RowDataPacket & { code: string }>(
      `SELECT DISTINCT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND r.deleted_at IS NULL AND p.deleted_at IS NULL`,
      [userId]
    )
  ]);

  return {
    id: Number(user.id),
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar,
    status: Number(user.status),
    roles: roleRows.map((r) => r.code),
    permissions: permRows.map((p) => p.code)
  };
}

async function writeLoginLog(input: {
  userId: number | null;
  username: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  message: string;
}): Promise<void> {
  await execute(
    `INSERT INTO login_logs (user_id, username, ip, user_agent, success, message)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.userId, input.username, input.ip, input.userAgent?.slice(0, 255) ?? null, input.success ? 1 : 0, input.message]
  );
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export async function login(input: {
  username: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<LoginResult> {
  const user = await queryOne<UserRow>('SELECT * FROM users WHERE username = ? AND deleted_at IS NULL', [input.username]);

  if (!user) {
    await writeLoginLog({ userId: null, username: input.username, ip: input.ip, userAgent: input.userAgent, success: false, message: '账号不存在' });
    throw AppError.badRequest('用户名或密码错误');
  }

  const matched = await verifyPassword(input.password, user.password);
  if (!matched) {
    await writeLoginLog({ userId: Number(user.id), username: input.username, ip: input.ip, userAgent: input.userAgent, success: false, message: '密码错误' });
    countBusinessEvent('login_failed');
    throw AppError.badRequest('用户名或密码错误');
  }

  if (Number(user.status) !== 1) {
    await writeLoginLog({ userId: Number(user.id), username: input.username, ip: input.ip, userAgent: input.userAgent, success: false, message: '账号已停用' });
    throw AppError.forbidden('账号已被停用，请联系管理员');
  }

  const { token: refreshToken, jti, expiresAt } = signRefreshToken(Number(user.id));
  await execute(
    `INSERT INTO refresh_tokens (user_id, jti, token_hash, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [Number(user.id), jti, hashToken(refreshToken), expiresAt, input.ip, input.userAgent?.slice(0, 255) ?? null]
  );
  await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [Number(user.id)]);
  await writeLoginLog({ userId: Number(user.id), username: input.username, ip: input.ip, userAgent: input.userAgent, success: true, message: '登录成功' });

  const authUser = await getAuthUser(Number(user.id));
  if (!authUser) throw AppError.internal('登录后加载用户信息失败');
  countBusinessEvent('login_success');

  return {
    accessToken: signAccessToken({ id: authUser.id, username: authUser.username }),
    refreshToken,
    user: {
      ...authUser,
      email: user.email,
      lastLoginAt: user.last_login_at
    }
  };
}

/** 刷新令牌并旋转：旧 token 立即作废，降低被盗用风险 */
export async function refresh(refreshToken: string, ip: string | null, userAgent: string | null): Promise<LoginResult> {
  const payload = verifyRefreshToken(refreshToken);
  const record = await queryOne<RowDataPacket & { id: number; user_id: number }>(
    `SELECT id, user_id FROM refresh_tokens
     WHERE jti = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
    [payload.jti, hashToken(refreshToken)]
  );
  if (!record) throw AppError.unauthorized('刷新令牌已失效，请重新登录');

  await execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = ?', [Number(record.id)]);

  const authUser = await getAuthUser(Number(record.user_id));
  if (!authUser) throw AppError.unauthorized('账号不存在或已被停用');
  if (authUser.status !== 1) throw AppError.forbidden('账号已被停用，请联系管理员');

  const next = signRefreshToken(authUser.id);
  await execute(
    `INSERT INTO refresh_tokens (user_id, jti, token_hash, expires_at, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [authUser.id, next.jti, hashToken(next.token), next.expiresAt, ip, userAgent?.slice(0, 255) ?? null]
  );

  const user = await queryOne<UserRow>('SELECT email, last_login_at FROM users WHERE id = ?', [authUser.id]);
  return {
    accessToken: signAccessToken({ id: authUser.id, username: authUser.username }),
    refreshToken: next.token,
    user: { ...authUser, email: user?.email ?? '', lastLoginAt: user?.last_login_at ?? null }
  };
}

/** 登出：给指定 refresh token 吊销；不传则吊销该用户全部会话（强制下线） */
export async function logout(userId: number, refreshToken?: string): Promise<{ revoked: number }> {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      const result = await execute(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE jti = ? AND user_id = ? AND revoked_at IS NULL',
        [payload.jti, userId]
      );
      return { revoked: result.affectedRows };
    } catch {
      // token 无效也视为登出成功，避免前端卡死
      return { revoked: 0 };
    }
  }
  const result = await execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  return { revoked: result.affectedRows };
}

/** 管理员改密/停用后可强制该用户下线 */
export async function revokeAllSessions(userId: number): Promise<number> {
  const result = await execute('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  return result.affectedRows;
}

export async function changeOwnPassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
  const user = await queryOne<UserRow>('SELECT id, password FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) throw AppError.notFound('用户不存在');
  const matched = await verifyPassword(oldPassword, user.password);
  if (!matched) throw AppError.badRequest('原密码不正确');
  const hashed = await hashPassword(newPassword);
  await execute('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
  await revokeAllSessions(userId);
}
