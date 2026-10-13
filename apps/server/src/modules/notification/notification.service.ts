import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne } from '../../db/pool.js';
import { logger } from '../../common/logger.js';

export type NotificationType = 'audit' | 'comment' | 'reply' | 'follow' | 'like' | 'mention' | 'system';

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  content?: string;
  link?: string;
  actorId?: number | null;
}

/**
 * 写入站内通知：通知失败绝不能影响主业务，因此这里吞掉异常只记日志。
 * 自己触发自己的行为（如评论自己的文章）不会产生通知。
 */
export async function notify(input: CreateNotificationInput): Promise<void> {
  if (input.actorId && input.actorId === input.userId) return;
  try {
    await execute(
      'INSERT INTO notifications (user_id, type, title, content, link, actor_id) VALUES (?, ?, ?, ?, ?, ?)',
      [input.userId, input.type, input.title.slice(0, 120), (input.content ?? '').slice(0, 500), (input.link ?? '').slice(0, 255), input.actorId ?? null]
    );
  } catch (error) {
    logger.error({ error, input }, '写入通知失败');
  }
}

export async function notifyMany(inputs: CreateNotificationInput[]): Promise<void> {
  for (const input of inputs) await notify(input);
}

export interface ListNotificationParams {
  isRead?: number;
  page: number;
  pageSize: number;
}

export async function listNotifications(userId: number, params: ListNotificationParams) {
  const where = ['n.user_id = ?', 'n.deleted_at IS NULL'];
  const args: unknown[] = [userId];
  if (params.isRead !== undefined) {
    where.push('n.is_read = ?');
    args.push(params.isRead);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM notifications n WHERE ' + whereSql,
    args
  );
  const list = await query<RowDataPacket>(
    'SELECT n.id, n.type, n.title, n.content, n.link, n.is_read AS isRead, n.actor_id AS actorId, ' +
      'u.nickname AS actorName, n.created_at AS createdAt ' +
      'FROM notifications n LEFT JOIN users u ON u.id = n.actor_id ' +
      'WHERE ' + whereSql + ' ORDER BY n.id DESC LIMIT ? OFFSET ?',
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );
  return { list, total: Number(totalRow?.total ?? 0) };
}

export async function unreadCount(userId: number): Promise<number> {
  const row = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0 AND deleted_at IS NULL',
    [userId]
  );
  return Number(row?.total ?? 0);
}

export async function markRead(userId: number, ids: number[]): Promise<number> {
  const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return 0;
  const placeholders = unique.map(() => '?').join(',');
  const result = await execute(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (' + placeholders + ') AND is_read = 0',
    [userId, ...unique]
  );
  return result.affectedRows;
}

export async function markAllRead(userId: number): Promise<number> {
  const result = await execute('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0 AND deleted_at IS NULL', [userId]);
  return result.affectedRows;
}

export async function removeNotification(userId: number, id: number): Promise<void> {
  await execute('UPDATE notifications SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [id, userId]);
}
