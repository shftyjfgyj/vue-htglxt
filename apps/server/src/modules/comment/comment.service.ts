import type { RowDataPacket } from 'mysql2';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import { notify } from '../notification/notification.service.js';
import * as moderation from '../moderation/moderation.service.js';

export interface ListCommentParams {
  articleId?: number;
  auditStatus?: number;
  keyword?: string;
  /** 只看某个用户的评论（无 comment:manage 权限时强制为本人） */
  userId?: number;
  page: number;
  pageSize: number;
}

export async function listComments(params: ListCommentParams) {
  const where: string[] = ['c.deleted_at IS NULL'];
  const args: unknown[] = [];
  if (params.articleId !== undefined) { where.push('c.article_id = ?'); args.push(params.articleId); }
  if (params.auditStatus !== undefined) {
    where.push('c.audit_status = ?');
    args.push(params.auditStatus);
  }
  if (params.userId !== undefined) {
    where.push('c.user_id = ?');
    args.push(params.userId);
  }
  if (params.keyword) { where.push('c.content LIKE ?'); args.push('%' + params.keyword + '%'); }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>('SELECT COUNT(*) AS total FROM comments c WHERE ' + whereSql, args);
  // 关联父评论，便于后台直接看到「回复了谁的什么内容」，而不是只有一个 #id
  const list = await query<RowDataPacket>(
    'SELECT c.id, c.article_id AS articleId, a.title AS articleTitle, c.user_id AS userId, u.nickname AS userName, ' +
      'c.parent_id AS parentId, c.content, c.audit_status AS auditStatus, c.created_at AS createdAt, ' +
      'p.content AS parentContent, p.audit_status AS parentAuditStatus, pu.nickname AS parentUserName, ' +
      // 机器判定结论（最近一条），用于「机器判定」列与审核记录
      "(SELECT ar.decision FROM audit_records ar WHERE ar.target_type = 'comment' AND ar.target_id = c.id ORDER BY ar.id DESC LIMIT 1) AS auditDecision, " +
      "(SELECT ar.hit_words FROM audit_records ar WHERE ar.target_type = 'comment' AND ar.target_id = c.id ORDER BY ar.id DESC LIMIT 1) AS auditHitWords " +
      'FROM comments c LEFT JOIN articles a ON a.id = c.article_id LEFT JOIN users u ON u.id = c.user_id ' +
      'LEFT JOIN comments p ON p.id = c.parent_id LEFT JOIN users pu ON pu.id = p.user_id ' +
      'WHERE ' + whereSql + ' ORDER BY c.id DESC LIMIT ? OFFSET ?',
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );
  return { list, total: Number(totalRow?.total ?? 0) };
}

export async function createComment(input: { articleId: number; userId: number; content: string; parentId?: number | null }) {
  const article = await queryOne<RowDataPacket & { status: number; user_id: number; title: string }>(
    'SELECT id, status, user_id, title FROM articles WHERE id = ? AND deleted_at IS NULL',
    [input.articleId]
  );
  if (!article) throw AppError.notFound('文章不存在');
  if (Number(article.status) !== 2) throw AppError.badRequest('只能评论已发布的文章');

  // 楼中楼：父评论必须属于同一篇文章
  let parent: { id: number; user_id: number } | null = null;
  if (input.parentId) {
    const found = await queryOne<RowDataPacket & { id: number; user_id: number; article_id: number }>(
      'SELECT id, user_id, article_id FROM comments WHERE id = ? AND deleted_at IS NULL',
      [input.parentId]
    );
    if (!found || Number(found.article_id) !== input.articleId) throw AppError.badRequest('被回复的评论不存在');
    parent = { id: Number(found.id), user_id: Number(found.user_id) };
  }

  // 自动审核：命中 block → 拒绝；命中 review 或不可信 → 待审核；否则直接通过
  const verdict = await moderation.moderate(input.userId, input.content, 'comment');
  const auditStatus = verdict.decision === 'pass' ? 1 : verdict.decision === 'reject' ? 2 : 0;

  const created = await withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT INTO comments (article_id, user_id, parent_id, content, audit_status) VALUES (?, ?, ?, ?, ?)',
      [input.articleId, input.userId, input.parentId ?? null, input.content, auditStatus]
    );
    // 只有审核通过的评论才计入文章评论数，避免计数虚高
    if (auditStatus === 1) {
      await conn.query('UPDATE articles SET comment_count = comment_count + 1 WHERE id = ?', [input.articleId]);
    }
    return { id: Number(result.insertId) };
  });

  await moderation.recordAutoAudit({ targetType: 'comment', targetId: created.id, result: verdict });
  if (verdict.decision === 'reject') {
    await moderation.penalizeUser(input.userId);
    await notify({
      userId: input.userId,
      type: 'system',
      title: '评论被自动拦截',
      content: verdict.reason,
      link: '/content/articles/' + input.articleId + '/view'
    });
  }

  const actor = await queryOne<RowDataPacket & { nickname: string }>('SELECT nickname FROM users WHERE id = ?', [input.userId]);
  const preview = input.content.slice(0, 80);
  const link = '/content/articles/' + input.articleId + '/view';

  // 通知文章作者；若是回复，同时通知被回复的人
  await notify({
    userId: Number(article.user_id),
    type: 'comment',
    title: (actor?.nickname ?? '有人') + ' 评论了你的文章：' + article.title,
    content: preview,
    link,
    actorId: input.userId
  });
  if (parent) {
    await notify({
      userId: parent.user_id,
      type: 'reply',
      title: (actor?.nickname ?? '有人') + ' 回复了你的评论',
      content: preview,
      link,
      actorId: input.userId
    });
  }

  // @提及：通知被点名的人（排除自己，以及上面已经通知过的作者/被回复人）
  const mentioned = await notifyMentions(input.content, {
    actorId: input.userId,
    actorName: actor?.nickname ?? '有人',
    link,
    preview,
    skip: new Set([input.userId, Number(article.user_id), ...(parent ? [parent.user_id] : [])])
  });

  return { ...created, auditStatus, decision: verdict.decision, reason: verdict.reason, mentioned };
}

/**
 * 从评论正文里解析 @昵称。
 * 昵称按「非空白、非 @、非标点」截断，最多取 5 个并去重。
 * 前面的 (?<![\w.]) 是为了不把邮箱（a@b.com）里的 @ 当成提及。
 */
export function extractMentions(content: string): string[] {
  const tokens = String(content ?? '').match(/(?<![\w.])@([^\s@#，。！？、,:;.!?]{1,30})/g) ?? [];
  const names = tokens.map((token) => token.slice(1)).filter((name) => name.length > 0);
  return [...new Set(names)].slice(0, 5);
}

/** 解析 @提及并逐个发通知，返回真正被通知到的昵称 */
async function notifyMentions(
  content: string,
  context: {
    actorId: number;
    actorName: string;
    link: string;
    preview: string;
    /** 已经因为「评论了文章 / 回复了评论」收到通知的人，不再重复打扰 */
    skip: Set<number>;
  }
): Promise<string[]> {
  const names = extractMentions(content);
  if (names.length === 0) return [];

  const rows = await query<RowDataPacket & { id: number; nickname: string }>(
    'SELECT id, nickname FROM users WHERE deleted_at IS NULL AND status = 1 AND nickname IN (?)',
    [names]
  );

  const notified: string[] = [];
  for (const row of rows) {
    const userId = Number(row.id);
    if (context.skip.has(userId)) continue;
    context.skip.add(userId);
    await notify({
      userId,
      type: 'mention',
      title: context.actorName + ' 在评论里提到了你',
      content: context.preview,
      link: context.link,
      actorId: context.actorId
    });
    notified.push(String(row.nickname));
  }
  return notified;
}

export async function likeComment(commentId: number, userId: number) {
  const comment = await queryOne<RowDataPacket>('SELECT id FROM comments WHERE id = ? AND deleted_at IS NULL', [commentId]);
  if (!comment) throw AppError.notFound('评论不存在');

  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT IGNORE INTO comment_likes (comment_id, user_id) VALUES (?, ?)',
      [commentId, userId]
    );
    if (result.affectedRows > 0) {
      await conn.query('UPDATE comments SET like_count = like_count + 1 WHERE id = ?', [commentId]);
    }
    return { commentId, liked: true };
  });
}

export async function unlikeComment(commentId: number, userId: number) {
  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'DELETE FROM comment_likes WHERE comment_id = ? AND user_id = ?',
      [commentId, userId]
    );
    if (result.affectedRows > 0) {
      await conn.query('UPDATE comments SET like_count = GREATEST(like_count - 1, 0) WHERE id = ?', [commentId]);
    }
    return { commentId, liked: false };
  });
}

export interface CommentNode extends RowDataPacket {
  id: number;
  articleId: number;
  userId: number;
  userName: string;
  avatar: string;
  parentId: number | null;
  content: string;
  createdAt: string;
  likeCount: number;
  liked: boolean;
  children: CommentNode[];
}

/**
 * 文章评论树（读者页用）：只取审核通过的评论，按父子关系组装。
 * 顺带带上点赞数与「我有没有赞过」，前端才能渲染点赞按钮与热度排序。
 */
export async function listCommentTree(articleId: number, viewerId?: number): Promise<CommentNode[]> {
  const rows = await query<CommentNode>(
    'SELECT c.id, c.article_id AS articleId, c.user_id AS userId, u.nickname AS userName, u.avatar, ' +
      'c.parent_id AS parentId, c.content, c.created_at AS createdAt, c.like_count AS likeCount, ' +
      'EXISTS(SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = ?) AS liked ' +
      'FROM comments c LEFT JOIN users u ON u.id = c.user_id ' +
      'WHERE c.article_id = ? AND c.deleted_at IS NULL AND c.audit_status = 1 ORDER BY c.id ASC',
    [viewerId ?? 0, articleId]
  );

  const nodes = new Map<number, CommentNode>();
  for (const row of rows) {
    nodes.set(Number(row.id), { ...row, likeCount: Number(row.likeCount ?? 0), liked: Boolean(row.liked), children: [] } as CommentNode);
  }

  const roots: CommentNode[] = [];
  for (const row of rows) {
    const node = nodes.get(Number(row.id))!;
    const parent = row.parentId === null ? undefined : nodes.get(Number(row.parentId));
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** 取评论归属（权限判断用） */
export async function getCommentOwner(id: number) {
  const row = await queryOne<RowDataPacket & { userId: number }>(
    'SELECT user_id AS userId FROM comments WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? { userId: Number(row.userId) } : null;
}

export async function auditComment(id: number, auditStatus: number, operator?: { id: number; remark?: string }) {
  const before = await queryOne<RowDataPacket & { audit_status: number; article_id: number }>(
    'SELECT audit_status, article_id FROM comments WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!before) throw AppError.notFound('评论不存在');

  const wasApproved = Number(before.audit_status) === 1;
  const nowApproved = auditStatus === 1;

  await withTransaction(async (conn) => {
    await conn.query('UPDATE comments SET audit_status = ? WHERE id = ?', [auditStatus, id]);
    // 审核结果变化时同步文章评论数（用 GREATEST 避免无符号列下溢）
    if (wasApproved !== nowApproved) {
      await conn.query(
        nowApproved
          ? 'UPDATE articles SET comment_count = comment_count + 1 WHERE id = ?'
          : 'UPDATE articles SET comment_count = GREATEST(comment_count, 1) - 1 WHERE id = ?',
        [before.article_id]
      );
    }
  });

  if (operator) {
    await moderation.recordManualAudit({
      targetType: 'comment',
      targetId: id,
      approved: nowApproved,
      operatorId: operator.id,
      remark: operator.remark
    });
  }
  return { id, auditStatus };
}

/**
 * 删除评论：有 comment:delete 权限可删任意评论，否则只能删自己的
 * （「我的评论」页面就是靠这条规则让普通用户管理自己的评论）
 */
export async function deleteComment(id: number, user?: { id: number; permissions: string[] }) {
  const comment = await queryOne<RowDataPacket & { article_id: number; user_id: number }>(
    'SELECT id, article_id, user_id FROM comments WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!comment) throw AppError.notFound('评论不存在');
  if (user && Number(comment.user_id) !== user.id && !user.permissions.includes('comment:delete') && !user.permissions.includes('comment:manage')) {
    throw AppError.forbidden('只能删除自己的评论');
  }

  return withTransaction(async (conn) => {
    await conn.query('UPDATE comments SET deleted_at = NOW() WHERE id = ?', [id]);
    await conn.query('UPDATE articles SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = ?', [comment.article_id]);
    return { id };
  });
}
