import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import { hashPassword } from '../../utils/password.js';
import { revokeAllSessions } from '../auth/auth.service.js';
import { storage } from '../upload/storage.js';

export interface UserListItem {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
  status: number;
  roles: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ListUserParams {
  keyword?: string;
  status?: number;
  page: number;
  pageSize: number;
}

interface CountRow extends RowDataPacket { total: number }

export async function listUsers(params: ListUserParams): Promise<{ list: UserListItem[]; total: number }> {
  const where: string[] = ['u.deleted_at IS NULL'];
  const args: unknown[] = [];

  if (params.keyword) {
    where.push('(u.username LIKE ? OR u.nickname LIKE ? OR u.email LIKE ?)');
    const like = `%${params.keyword}%`;
    args.push(like, like, like);
  }
  if (params.status !== undefined) {
    where.push('u.status = ?');
    args.push(params.status);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<CountRow>(`SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`, args);
  const list = await query<UserListItem & RowDataPacket>(
    `SELECT u.id, u.username, u.nickname, u.email, u.avatar, u.status,
            u.auto_audit AS autoAudit, u.violation_count AS violationCount, u.last_violation_at AS lastViolationAt,
            u.created_at AS createdAt, u.last_login_at AS lastLoginAt,
            COALESCE(GROUP_CONCAT(r.name ORDER BY r.id SEPARATOR '、'), '') AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
     WHERE ${whereSql}
     GROUP BY u.id
     ORDER BY u.id ASC
     LIMIT ? OFFSET ?`,
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );

  return { list, total: Number(totalRow?.total ?? 0) };
}

export async function getUserDetail(id: number) {
  const user = await queryOne<RowDataPacket>(
    `SELECT id, username, nickname, email, avatar, status, created_at AS createdAt, updated_at AS updatedAt, last_login_at AS lastLoginAt
     FROM users WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  if (!user) throw AppError.notFound('用户不存在');

  const roles = await query<RowDataPacket & { id: number; code: string; name: string }>(
    `SELECT r.id, r.code, r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.deleted_at IS NULL`,
    [id]
  );
  return { ...user, roles };
}

export async function createUser(input: {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  status?: number;
  roleIds?: number[];
}) {
  const exists = await queryOne<RowDataPacket>('SELECT id FROM users WHERE username = ?', [input.username]);
  if (exists) throw AppError.conflict('用户名已存在');

  const hashed = await hashPassword(input.password);
  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT INTO users (username, password, nickname, email, status) VALUES (?, ?, ?, ?, ?)',
      [input.username, hashed, input.nickname ?? input.username, input.email ?? '', input.status ?? 1]
    );
    const userId = Number(result.insertId);
    if (input.roleIds?.length) {
      const values = input.roleIds.map((roleId) => [userId, roleId]);
      await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ?', [values]);
    }
    return { id: userId };
  });
}

export async function updateUser(id: number, input: { nickname?: string; email?: string; avatar?: string }) {
  const fields: string[] = [];
  const args: unknown[] = [];
  if (input.nickname !== undefined) { fields.push('nickname = ?'); args.push(input.nickname); }
  if (input.email !== undefined) { fields.push('email = ?'); args.push(input.email); }
  if (input.avatar !== undefined) { fields.push('avatar = ?'); args.push(input.avatar); }
  if (fields.length === 0) throw AppError.badRequest('没有需要更新的字段');

  const result = await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, [...args, id]);
  if (result.affectedRows === 0) throw AppError.notFound('用户不存在');
  return { id };
}

export async function setStatus(id: number, status: number, operatorId: number) {
  if (id === operatorId) throw AppError.badRequest('不能停用/启用自己');
  const result = await execute('UPDATE users SET status = ? WHERE id = ? AND deleted_at IS NULL', [status, id]);
  if (result.affectedRows === 0) throw AppError.notFound('用户不存在');
  if (status === 0) await revokeAllSessions(id);
  return { id, status };
}

/**
 * 信任设置：管理员可强制授予/取消某用户的自动审核信任，或清除违规记录。
 * autoAudit=true 表示无论发布量都直接自动发布。
 */
export async function setTrust(id: number, input: { autoAudit?: boolean; resetViolations?: boolean }) {
  const user = await queryOne<RowDataPacket>('SELECT id FROM users WHERE id = ?', [id]);
  if (!user) throw AppError.notFound('用户不存在');

  const fields: string[] = [];
  const args: unknown[] = [];
  if (input.autoAudit !== undefined) {
    fields.push('auto_audit = ?');
    args.push(input.autoAudit ? 1 : 0);
  }
  if (input.resetViolations) {
    fields.push('violation_count = 0', 'last_violation_at = NULL');
  }
  if (fields.length === 0) throw AppError.badRequest('没有需要更新的内容');

  await execute('UPDATE users SET ' + fields.join(', ') + ' WHERE id = ?', [...args, id]);
  return { id, autoAudit: input.autoAudit, resetViolations: Boolean(input.resetViolations) };
}

export async function resetPassword(id: number, newPassword: string) {
  const hashed = await hashPassword(newPassword);
  const result = await execute('UPDATE users SET password = ? WHERE id = ? AND deleted_at IS NULL', [hashed, id]);
  if (result.affectedRows === 0) throw AppError.notFound('用户不存在');
  const revoked = await revokeAllSessions(id);
  return { id, revokedSessions: revoked };
}

export async function softDeleteUser(id: number, operatorId: number) {
  if (id === operatorId) throw AppError.badRequest('不能删除自己');
  const result = await execute('UPDATE users SET deleted_at = NOW(), status = 0 WHERE id = ? AND deleted_at IS NULL', [id]);
  if (result.affectedRows === 0) throw AppError.notFound('用户不存在');
  await revokeAllSessions(id);
  return { id };
}

/** 更新头像：落库后清理旧文件（本地磁盘或对象存储），避免越堆越多 */
export async function updateAvatar(userId: number, url: string) {
  const current = await queryOne<RowDataPacket & { avatar: string }>(
    'SELECT avatar FROM users WHERE id = ? AND deleted_at IS NULL',
    [userId]
  );
  if (!current) throw AppError.notFound('用户不存在');

  const result = await execute('UPDATE users SET avatar = ? WHERE id = ?', [url, userId]);
  if (result.affectedRows === 0) throw AppError.notFound('用户不存在');

  await storage.remove(current.avatar);
  return { id: userId, avatar: url };
}

export async function updateMe(id: number, input: { nickname?: string; email?: string; avatar?: string }) {
  return updateUser(id, input);
}
