import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';

export interface CategoryItem {
  id: number;
  name: string;
  alias: string;
  sort: number;
  articleCount: number;
  createdAt: string;
}

export async function listCategories(): Promise<CategoryItem[]> {
  return query<CategoryItem & RowDataPacket>(
    'SELECT c.id, c.name, c.alias, c.sort, c.created_at AS createdAt, ' +
      '(SELECT COUNT(*) FROM articles a WHERE a.category_id = c.id AND a.deleted_at IS NULL) AS articleCount ' +
      'FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort ASC, c.id ASC'
  );
}

export async function createCategory(input: { name: string; alias: string; sort?: number }, userId: number) {
  const exists = await queryOne<RowDataPacket>('SELECT id FROM categories WHERE alias = ? AND deleted_at IS NULL', [input.alias]);
  if (exists) throw AppError.conflict('分类别名已存在');
  const result = await execute('INSERT INTO categories (name, alias, sort, created_by) VALUES (?, ?, ?, ?)', [
    input.name,
    input.alias,
    input.sort ?? 0,
    userId
  ]);
  return { id: Number(result.insertId) };
}

export async function updateCategory(id: number, input: { name?: string; alias?: string; sort?: number }) {
  if (input.alias) {
    const exists = await queryOne<RowDataPacket>('SELECT id FROM categories WHERE alias = ? AND id <> ? AND deleted_at IS NULL', [input.alias, id]);
    if (exists) throw AppError.conflict('分类别名已存在');
  }
  const fields: string[] = [];
  const args: unknown[] = [];
  if (input.name !== undefined) { fields.push('name = ?'); args.push(input.name); }
  if (input.alias !== undefined) { fields.push('alias = ?'); args.push(input.alias); }
  if (input.sort !== undefined) { fields.push('sort = ?'); args.push(input.sort); }
  if (fields.length === 0) throw AppError.badRequest('没有需要更新的字段');

  const result = await execute('UPDATE categories SET ' + fields.join(', ') + ' WHERE id = ? AND deleted_at IS NULL', [...args, id]);
  if (result.affectedRows === 0) throw AppError.notFound('分类不存在');
  return { id };
}

export async function deleteCategory(id: number) {
  const category = await queryOne<RowDataPacket>('SELECT id FROM categories WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!category) throw AppError.notFound('分类不存在');
  const used = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM articles WHERE category_id = ? AND deleted_at IS NULL',
    [id]
  );
  if (Number(used?.total ?? 0) > 0) throw AppError.badRequest('该分类下仍有文章，请先迁移或删除文章');
  await execute('UPDATE categories SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id };
}
