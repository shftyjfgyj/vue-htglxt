import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import { notify } from '../notification/notification.service.js';

export async function likeArticle(articleId: number, userId: number) {
  const article = await queryOne<RowDataPacket>('SELECT id FROM articles WHERE id = ? AND deleted_at IS NULL', [articleId]);
  if (!article) throw AppError.notFound('文章不存在');

  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT IGNORE INTO article_likes (article_id, user_id) VALUES (?, ?)',
      [articleId, userId]
    );
    if (result.affectedRows > 0) {
      await conn.query('UPDATE articles SET like_count = like_count + 1 WHERE id = ?', [articleId]);
    }
    return { articleId, liked: true };
  });
}

export async function unlikeArticle(articleId: number, userId: number) {
  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'DELETE FROM article_likes WHERE article_id = ? AND user_id = ?',
      [articleId, userId]
    );
    if (result.affectedRows > 0) {
      await conn.query('UPDATE articles SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [articleId]);
    }
    return { articleId, liked: false };
  });
}

/**
 * 记录阅读历史：每人每篇只保留最近一次（唯一键 + ON DUPLICATE KEY UPDATE），
 * 这样「最近在看」不会因为反复阅读而刷屏。
 */
export async function recordView(articleId: number, userId: number): Promise<void> {
  await execute(
    'INSERT INTO article_view_logs (article_id, user_id, viewed_at) VALUES (?, ?, NOW()) ' +
      'ON DUPLICATE KEY UPDATE viewed_at = NOW()',
    [articleId, userId]
  );
}

/** 最近在看（阅读历史） */
export async function listHistory(userId: number, params: { page: number; pageSize: number }) {
  return queryLibraryList('article_view_logs', 'rel.viewed_at', userId, params);
}

/** 关注动态：我关注的作者发布的已发布文章 */
export async function listFeed(userId: number, params: { page: number; pageSize: number }) {
  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM follows f ' +
      'JOIN articles a ON a.user_id = f.following_id AND a.status = 2 AND a.deleted_at IS NULL ' +
      'WHERE f.follower_id = ?',
    [userId]
  );
  const list = await query<RowDataPacket>(
    'SELECT a.id, a.title, a.summary, a.status, a.cover_img AS coverImg, c.name AS categoryName, ' +
      'u.nickname AS authorName, u.avatar AS authorAvatar, a.view_count AS viewCount, a.like_count AS likeCount, ' +
      'a.comment_count AS commentCount, a.favorite_count AS favoriteCount, ' +
      "COALESCE((SELECT GROUP_CONCAT(t.name ORDER BY t.id SEPARATOR '、') FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id), '') AS tags, " +
      'a.publish_at AS markedAt ' +
      'FROM follows f ' +
      'JOIN articles a ON a.user_id = f.following_id AND a.status = 2 AND a.deleted_at IS NULL ' +
      'LEFT JOIN categories c ON c.id = a.category_id ' +
      'LEFT JOIN users u ON u.id = a.user_id ' +
      'WHERE f.follower_id = ? ' +
      'ORDER BY a.publish_at DESC, a.id DESC LIMIT ? OFFSET ?',
    [userId, params.pageSize, (params.page - 1) * params.pageSize]
  );
  return { list, total: Number(totalRow?.total ?? 0) };
}

/** 把收藏移动到指定分组 */
export async function moveFavoriteFolder(articleId: number, userId: number, folder: string) {
  const result = await execute('UPDATE article_favorites SET folder = ? WHERE article_id = ? AND user_id = ?', [
    folder,
    articleId,
    userId
  ]);
  if (result.affectedRows === 0) throw AppError.notFound('该收藏不存在');
  return { articleId, folder };
}

/** 我的收藏里出现过的分组（用于前端筛选标签） */
export async function listFavoriteFolders(userId: number) {
  const rows = await query<RowDataPacket & { folder: string; total: number }>(
    'SELECT folder, COUNT(*) AS total FROM article_favorites WHERE user_id = ? GROUP BY folder ORDER BY total DESC',
    [userId]
  );
  return rows.map((row) => ({ folder: row.folder, total: Number(row.total) }));
}

export async function favoriteArticle(articleId: number, userId: number, folder = '默认分组') {
  const article = await queryOne<RowDataPacket>('SELECT id FROM articles WHERE id = ? AND deleted_at IS NULL', [articleId]);
  if (!article) throw AppError.notFound('文章不存在');

  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT INTO article_favorites (article_id, user_id, folder) VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE folder = VALUES(folder)',
      [articleId, userId, folder.slice(0, 30) || '默认分组']
    );
    if (result.affectedRows > 0) {
      await conn.query('UPDATE articles SET favorite_count = favorite_count + 1 WHERE id = ?', [articleId]);
    }
    return { articleId, favorited: true };
  });
}

export async function unfavoriteArticle(articleId: number, userId: number) {
  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'DELETE FROM article_favorites WHERE article_id = ? AND user_id = ?',
      [articleId, userId]
    );
    if (result.affectedRows > 0) {
      await conn.query('UPDATE articles SET favorite_count = GREATEST(favorite_count - 1, 0) WHERE id = ?', [articleId]);
    }
    return { articleId, favorited: false };
  });
}

/**
 * 内容库列表（我的收藏 / 我的点赞 / 最近在看 共用）：
 * 只需给出关联表、时间字段与可选分组，SQL 结构完全一致。
 */
async function queryLibraryList(
  joinTable: string,
  timeExpression: string,
  userId: number,
  params: { page: number; pageSize: number },
  options: { folder?: string } = {}
) {
  const where = ['rel.user_id = ?'];
  const args: unknown[] = [userId];
  if (options.folder && options.folder !== '全部') {
    where.push('rel.folder = ?');
    args.push(options.folder);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM ' + joinTable + ' rel ' +
      'JOIN articles a ON a.id = rel.article_id AND a.deleted_at IS NULL WHERE ' + whereSql,
    args
  );

  const selectFolder = joinTable === 'article_favorites' ? 'rel.folder AS folder, ' : '';
  const list = await query<RowDataPacket>(
    'SELECT a.id, a.title, a.summary, a.status, a.cover_img AS coverImg, c.name AS categoryName, ' +
      'u.nickname AS authorName, a.view_count AS viewCount, a.like_count AS likeCount, ' +
      'a.comment_count AS commentCount, a.favorite_count AS favoriteCount, ' +
      selectFolder +
      "COALESCE((SELECT GROUP_CONCAT(t.name ORDER BY t.id SEPARATOR '、') FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id), '') AS tags, " +
      timeExpression + ' AS markedAt ' +
      'FROM ' + joinTable + ' rel ' +
      'JOIN articles a ON a.id = rel.article_id AND a.deleted_at IS NULL ' +
      'LEFT JOIN categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.user_id ' +
      'WHERE ' + whereSql + ' ORDER BY ' + timeExpression + ' DESC LIMIT ? OFFSET ?',
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );

  return { list, total: Number(totalRow?.total ?? 0) };
}

/** 我的收藏 / 我的点赞（同一套返回结构，收藏额外支持分组筛选） */
export async function listMyArticles(
  userId: number,
  kind: 'favorites' | 'likes',
  params: { page: number; pageSize: number },
  options: { folder?: string } = {}
) {
  return kind === 'favorites'
    ? queryLibraryList('article_favorites', 'rel.created_at', userId, params, options)
    : queryLibraryList('article_likes', 'rel.created_at', userId, params);
}

/** 阅读页「相关文章」：同分类或共享标签的已发布文章 */
export async function listRelatedArticles(articleId: number, limit: number) {
  const article = await queryOne<RowDataPacket & { category_id: number | null }>(
    'SELECT category_id FROM articles WHERE id = ? AND deleted_at IS NULL',
    [articleId]
  );
  if (!article) throw AppError.notFound('文章不存在');

  return query<RowDataPacket>(
    'SELECT a.id, a.title, a.view_count AS viewCount, a.like_count AS likeCount, c.name AS categoryName, ' +
      'COUNT(DISTINCT at.tag_id) AS sharedTags ' +
      'FROM articles a ' +
      'LEFT JOIN categories c ON c.id = a.category_id ' +
      'LEFT JOIN article_tags at ON at.article_id = a.id AND at.tag_id IN (' +
      '  SELECT tag_id FROM article_tags WHERE article_id = ?' +
      ') ' +
      'WHERE a.deleted_at IS NULL AND a.status = 2 AND a.id <> ? ' +
      '  AND (a.category_id <=> ? OR at.tag_id IS NOT NULL) ' +
      'GROUP BY a.id ' +
      'ORDER BY sharedTags DESC, a.view_count DESC ' +
      'LIMIT ?',
    [articleId, articleId, article.category_id, limit]
  );
}

export async function followUser(followerId: number, followingId: number) {
  if (followerId === followingId) throw AppError.badRequest('不能关注自己');
  const target = await queryOne<RowDataPacket>('SELECT id FROM users WHERE id = ? AND deleted_at IS NULL', [followingId]);
  if (!target) throw AppError.notFound('用户不存在');
  const result = await execute('INSERT IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)', [followerId, followingId]);
  if (result.affectedRows > 0) {
    const actor = await queryOne<RowDataPacket & { nickname: string }>('SELECT nickname FROM users WHERE id = ?', [followerId]);
    await notify({
      userId: followingId,
      type: 'follow',
      title: (actor?.nickname ?? '有人') + ' 关注了你',
      content: '点击查看关注管理',
      link: '/profile/follows',
      actorId: followerId
    });
  }
  return { followingId, following: true };
}

export async function unfollowUser(followerId: number, followingId: number) {
  await execute('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
  return { followingId, following: false };
}

interface FollowUserRow extends RowDataPacket {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  followedAt: string;
}

export async function listFollowers(userId: number): Promise<FollowUserRow[]> {
  return query<FollowUserRow>(
    'SELECT u.id, u.username, u.nickname, u.avatar, f.created_at AS followedAt FROM follows f ' +
      'JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? AND u.deleted_at IS NULL ORDER BY f.created_at DESC',
    [userId]
  );
}

export async function listFollowing(userId: number): Promise<FollowUserRow[]> {
  return query<FollowUserRow>(
    'SELECT u.id, u.username, u.nickname, u.avatar, f.created_at AS followedAt FROM follows f ' +
      'JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? AND u.deleted_at IS NULL ORDER BY f.created_at DESC',
    [userId]
  );
}

export async function listMutual(userId: number): Promise<FollowUserRow[]> {
  return query<FollowUserRow>(
    'SELECT u.id, u.username, u.nickname, u.avatar, f1.created_at AS followedAt FROM follows f1 ' +
      'JOIN follows f2 ON f2.follower_id = f1.following_id AND f2.following_id = f1.follower_id ' +
      'JOIN users u ON u.id = f1.following_id WHERE f1.follower_id = ? AND u.deleted_at IS NULL ORDER BY f1.created_at DESC',
    [userId]
  );
}

export async function followStatus(followerId: number, followingId: number) {
  const [following, followedBy, counts] = await Promise.all([
    queryOne<RowDataPacket>('SELECT 1 AS hit FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]),
    queryOne<RowDataPacket>('SELECT 1 AS hit FROM follows WHERE follower_id = ? AND following_id = ?', [followingId, followerId]),
    queryOne<RowDataPacket & { followers: number; following: number }>(
      'SELECT (SELECT COUNT(*) FROM follows WHERE following_id = ?) AS followers, (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following',
      [followingId, followingId]
    )
  ]);
  return {
    following: Boolean(following),
    followedBy: Boolean(followedBy),
    mutual: Boolean(following) && Boolean(followedBy),
    followers: Number(counts?.followers ?? 0),
    followingCount: Number(counts?.following ?? 0)
  };
}