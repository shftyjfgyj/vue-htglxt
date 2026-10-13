import type { RowDataPacket } from 'mysql2';
import { query } from '../../db/pool.js';
import type { AuthUser } from '../auth/auth.service.js';

export interface MenuNode {
  id: number;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  permissionCode: string | null;
  children: MenuNode[];
}

interface MenuRow extends RowDataPacket {
  id: number;
  parent_id: number | null;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  permission_code: string | null;
}

/** 按当前用户权限过滤菜单并组装成树 */
export async function listMenusFor(user: AuthUser): Promise<MenuNode[]> {
  const rows = await query<MenuRow>(
    'SELECT id, parent_id, name, path, icon, sort, permission_code FROM menus WHERE deleted_at IS NULL AND visible = 1 ORDER BY sort ASC, id ASC'
  );
  const isAdmin = user.permissions.includes('*');
  const visible = rows.filter((row) => !row.permission_code || isAdmin || user.permissions.includes(row.permission_code));

  const nodes = new Map<number, MenuNode>();
  for (const row of visible) {
    nodes.set(Number(row.id), {
      id: Number(row.id),
      name: row.name,
      path: row.path,
      icon: row.icon,
      sort: Number(row.sort),
      permissionCode: row.permission_code,
      children: []
    });
  }

  const roots: MenuNode[] = [];
  for (const row of visible) {
    const node = nodes.get(Number(row.id))!;
    const parentId = row.parent_id === null ? null : Number(row.parent_id);
    const parent = parentId === null ? undefined : nodes.get(parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // 剪枝：子项被权限过滤光的分组不应留下空壳（否则 editor 也会看到「系统管理」）
  const prune = (list: MenuNode[]): MenuNode[] =>
    list
      .map((node) => ({ ...node, children: prune(node.children) }))
      .filter((node) => Boolean(node.path) || node.children.length > 0);

  return prune(roots);
}
