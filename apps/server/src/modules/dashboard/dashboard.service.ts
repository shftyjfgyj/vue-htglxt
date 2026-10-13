import type { RowDataPacket } from 'mysql2';
import { query, queryOne } from '../../db/pool.js';

export async function overview() {
  const [articleStats, userCount, pendingComments, todayLogins, todayArticles] = await Promise.all([
    queryOne<RowDataPacket & { total: number; draft: number; pending: number; published: number; offline: number; views: number; likes: number }>(
      'SELECT COUNT(*) AS total, ' +
        'SUM(status = 0) AS draft, SUM(status = 1) AS pending, SUM(status = 2) AS published, SUM(status = 4) AS offline, ' +
        'COALESCE(SUM(view_count), 0) AS views, COALESCE(SUM(like_count), 0) AS likes ' +
        'FROM articles WHERE deleted_at IS NULL'
    ),
    queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM users WHERE deleted_at IS NULL'),
    queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM comments WHERE deleted_at IS NULL AND audit_status = 0'),
    queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM login_logs WHERE success = 1 AND created_at >= CURDATE()'),
    queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM articles WHERE deleted_at IS NULL AND created_at >= CURDATE()')
  ]);

  return {
    articles: {
      total: Number(articleStats?.total ?? 0),
      draft: Number(articleStats?.draft ?? 0),
      pending: Number(articleStats?.pending ?? 0),
      published: Number(articleStats?.published ?? 0),
      offline: Number(articleStats?.offline ?? 0),
      views: Number(articleStats?.views ?? 0),
      likes: Number(articleStats?.likes ?? 0)
    },
    users: Number(userCount?.total ?? 0),
    pendingComments: Number(pendingComments?.total ?? 0),
    todayLogins: Number(todayLogins?.total ?? 0),
    todayArticles: Number(todayArticles?.total ?? 0)
  };
}

/**
 * 多维趋势：每天的发文数 / 评论数 / 登录成功数。
 * 保持「数组 + day 字段」结构（total 仍表示发文数），前端图表与既有测试都可直接使用。
 */
export async function trend(days: number) {
  const [articleRows, commentRows, loginRows] = await Promise.all([
    query<RowDataPacket & { day: string; total: number }>(
      'SELECT DATE(created_at) AS day, COUNT(*) AS total FROM articles ' +
        'WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY DATE(created_at)',
      [days - 1]
    ),
    query<RowDataPacket & { day: string; total: number }>(
      'SELECT DATE(created_at) AS day, COUNT(*) AS total FROM comments ' +
        'WHERE deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY DATE(created_at)',
      [days - 1]
    ),
    query<RowDataPacket & { day: string; total: number }>(
      'SELECT DATE(created_at) AS day, COUNT(*) AS total FROM login_logs ' +
        'WHERE success = 1 AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY DATE(created_at)',
      [days - 1]
    )
  ]);

  const toMap = (rows: Array<RowDataPacket & { day: string; total: number }>) =>
    new Map(rows.map((row) => [String(row.day), Number(row.total)]));
  const articleMap = toMap(articleRows);
  const commentMap = toMap(commentRows);
  const loginMap = toMap(loginRows);

  const result: Array<{ day: string; total: number; comments: number; logins: number }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    result.push({ day: key, total: articleMap.get(key) ?? 0, comments: commentMap.get(key) ?? 0, logins: loginMap.get(key) ?? 0 });
  }
  return result;
}

export async function popularArticles() {
  return query<RowDataPacket>(
    'SELECT a.id, a.title, a.view_count AS viewCount, a.like_count AS likeCount, a.comment_count AS commentCount, u.nickname AS authorName ' +
      'FROM articles a LEFT JOIN users u ON u.id = a.user_id WHERE a.deleted_at IS NULL AND a.status = 2 ' +
      'ORDER BY a.view_count DESC, a.like_count DESC LIMIT 10'
  );
}