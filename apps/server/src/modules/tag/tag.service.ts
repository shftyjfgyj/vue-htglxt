import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';

export interface TagItem {
  id: number;
  name: string;
  color: string;
  usageCount: number;
  createdAt: string;
}

export async function listTags(): Promise<TagItem[]> {
  return query<TagItem & RowDataPacket>(
    'SELECT t.id, t.name, t.color, t.created_at AS createdAt, ' +
      '(SELECT COUNT(*) FROM article_tags at JOIN articles a ON a.id = at.article_id AND a.deleted_at IS NULL WHERE at.tag_id = t.id) AS usageCount ' +
      'FROM tags t WHERE t.deleted_at IS NULL ORDER BY t.id ASC'
  );
}

/** 热门标签：按被引用次数排序（老系统该接口被 /tags/:id 截获，这里由路由顺序与命名保证） */
export async function popularTags(limit: number): Promise<TagItem[]> {
  return query<TagItem & RowDataPacket>(
    'SELECT t.id, t.name, t.color, t.created_at AS createdAt, ' +
      '(SELECT COUNT(*) FROM article_tags at JOIN articles a ON a.id = at.article_id AND a.deleted_at IS NULL WHERE at.tag_id = t.id) AS usageCount ' +
      'FROM tags t WHERE t.deleted_at IS NULL ORDER BY usageCount DESC, t.id ASC LIMIT ?',
    [limit]
  );
}

export async function createTag(input: { name: string; color?: string }) {
  const exists = await queryOne<RowDataPacket>('SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL', [input.name]);
  if (exists) throw AppError.conflict('标签名称已存在');
  const result = await execute('INSERT INTO tags (name, color) VALUES (?, ?)', [input.name, input.color ?? '#409EFF']);
  return { id: Number(result.insertId) };
}

export async function updateTag(id: number, input: { name?: string; color?: string }) {
  if (input.name) {
    const exists = await queryOne<RowDataPacket>('SELECT id FROM tags WHERE name = ? AND id <> ? AND deleted_at IS NULL', [input.name, id]);
    if (exists) throw AppError.conflict('标签名称已存在');
  }
  const fields: string[] = [];
  const args: unknown[] = [];
  if (input.name !== undefined) { fields.push('name = ?'); args.push(input.name); }
  if (input.color !== undefined) { fields.push('color = ?'); args.push(input.color); }
  if (fields.length === 0) throw AppError.badRequest('没有需要更新的字段');

  const result = await execute('UPDATE tags SET ' + fields.join(', ') + ' WHERE id = ? AND deleted_at IS NULL', [...args, id]);
  if (result.affectedRows === 0) throw AppError.notFound('标签不存在');
  return { id };
}

export async function deleteTag(id: number) {
  const tag = await queryOne<RowDataPacket>('SELECT id FROM tags WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!tag) throw AppError.notFound('标签不存在');
  await execute('UPDATE tags SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id };
}
