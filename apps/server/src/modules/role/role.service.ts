import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string;
  isSystem: number;
  permissionCount: number;
  userCount: number;
  createdAt: string;
}

export async function listRoles(): Promise<RoleItem[]> {
  return query<RoleItem & RowDataPacket>(
    `SELECT r.id, r.code, r.name, r.description, r.is_system AS isSystem,
            r.created_at AS createdAt,
            (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissionCount,
            (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS userCount
     FROM roles r
     WHERE r.deleted_at IS NULL
     ORDER BY r.id ASC`
  );
}

export async function getRole(id: number) {
  const role = await queryOne<RowDataPacket>('SELECT * FROM roles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!role) throw AppError.notFound('角色不存在');
  return role;
}

export async function createRole(input: { code: string; name: string; description?: string; permissionIds?: number[] }) {
  const exists = await queryOne<RowDataPacket>('SELECT id FROM roles WHERE code = ?', [input.code]);
  if (exists) throw AppError.conflict('角色编码已存在');

  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT INTO roles (code, name, description, is_system) VALUES (?, ?, ?, 0)',
      [input.code, input.name, input.description ?? '']
    );
    const roleId = Number(result.insertId);
    if (input.permissionIds?.length) {
      await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ?', [
        input.permissionIds.map((pid) => [roleId, pid])
      ]);
    }
    return { id: roleId };
  });
}

export async function updateRole(id: number, input: { name?: string; description?: string }) {
  const fields: string[] = [];
  const args: unknown[] = [];
  if (input.name !== undefined) { fields.push('name = ?'); args.push(input.name); }
  if (input.description !== undefined) { fields.push('description = ?'); args.push(input.description); }
  if (fields.length === 0) throw AppError.badRequest('没有需要更新的字段');

  const result = await execute(`UPDATE roles SET ${fields.join(', ')} WHERE id = ? AND deleted_at IS NULL`, [...args, id]);
  if (result.affectedRows === 0) throw AppError.notFound('角色不存在');
  return { id };
}

export async function deleteRole(id: number) {
  const role = await getRole(id);
  if (Number(role.is_system) === 1) throw AppError.badRequest('系统内置角色不允许删除');
  const userCount = await queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM user_roles WHERE role_id = ?', [id]);
  if (Number(userCount?.total ?? 0) > 0) throw AppError.badRequest('该角色下仍有用户，请先解除关联');

  await execute('UPDATE roles SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id };
}

export async function getRolePermissionIds(roleId: number): Promise<number[]> {
  const rows = await query<RowDataPacket & { permission_id: number }>(
    'SELECT permission_id FROM role_permissions WHERE role_id = ?',
    [roleId]
  );
  return rows.map((r) => Number(r.permission_id));
}

/** 覆写角色权限（先清后插，事务保证一致性） */
export async function setRolePermissions(roleId: number, permissionIds: number[]) {
  const role = await getRole(roleId);
  if (role.code === 'admin') throw AppError.badRequest('超级管理员拥有全部权限，无需也不允许修改');

  const unique = [...new Set(permissionIds)];
  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
    if (unique.length > 0) {
      await conn.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [unique.map((pid) => [roleId, pid])]);
    }
  });
  return { id: roleId, permissionCount: unique.length };
}

export async function getUserRoles(userId: number) {
  const rows = await query<RowDataPacket & { id: number; code: string; name: string }>(
    `SELECT r.id, r.code, r.name FROM roles r
     JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.deleted_at IS NULL`,
    [userId]
  );
  return rows;
}

/** 覆写用户角色（事务） */
export async function setUserRoles(userId: number, roleIds: number[]) {
  const user = await queryOne<RowDataPacket>('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [userId]);
  if (!user) throw AppError.notFound('用户不存在');

  const unique = [...new Set(roleIds)];
  if (unique.length > 0) {
    const placeholders = unique.map(() => '?').join(',');
    const found = await query<RowDataPacket & { id: number }>(
      `SELECT id FROM roles WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      unique
    );
    if (found.length !== unique.length) throw AppError.badRequest('包含不存在的角色');
  }

  await withTransaction(async (conn) => {
    await conn.query('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    if (unique.length > 0) {
      await conn.query('INSERT INTO user_roles (user_id, role_id) VALUES ?', [unique.map((rid) => [userId, rid])]);
    }
  });
  return { userId, roleIds: unique };
}

export interface PermissionGroup {
  module: string;
  permissions: Array<{ id: number; code: string; name: string; type: string }>;
}

export async function listPermissions(): Promise<PermissionGroup[]> {
  const rows = await query<RowDataPacket & { id: number; code: string; name: string; type: string; module: string }>(
    'SELECT id, code, name, type, module FROM permissions WHERE deleted_at IS NULL ORDER BY module ASC, sort ASC, id ASC'
  );
  const groups = new Map<string, PermissionGroup>();
  for (const row of rows) {
    const group = groups.get(row.module) ?? { module: row.module, permissions: [] };
    group.permissions.push({ id: Number(row.id), code: row.code, name: row.name, type: row.type });
    groups.set(row.module, group);
  }
  return [...groups.values()];
}
