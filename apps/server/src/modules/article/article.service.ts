import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { execute, query, queryOne, withTransaction } from '../../db/pool.js';
import { AppError } from '../../common/errors.js';
import * as moderation from '../moderation/moderation.service.js';
import { diffLines } from '../../utils/diff.js';
import { notify } from '../notification/notification.service.js';
import { canEditOwnArticle, canManageOthersContent, canViewAllContent } from './article.access.js';
import { evaluateArticleQuality } from './article.quality.js';

/** 0 草稿 1 待审核 2 已发布 3 已驳回 4 已下线 */
export const ArticleStatus = { DRAFT: 0, PENDING: 1, PUBLISHED: 2, REJECTED: 3, OFFLINE: 4 } as const;

export interface ArticleListItem {
  id: number;
  title: string;
  summary: string;
  coverImg: string;
  status: number;
  categoryId: number | null;
  categoryName: string | null;
  authorId: number;
  authorName: string;
  auditRemark: string;
  auditDecision: string | null;
  auditHitWords: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  publishAt: string | null;
  updatedAt: string;
  updatedAtRaw?: string;
  tags: string;
}

export interface ListArticleParams {
  keyword?: string;
  status?: number;
  categoryId?: number;
  tagId?: number;
  authorId?: number;
  onlyMine?: boolean;
  /** 回收站：查看已软删除的文章 */
  trashed?: boolean;
  /** 排序方式 */
  sortBy?: 'updated' | 'created' | 'views' | 'likes';
  /** 使用 MySQL 全文索引（ngram）检索，默认 LIKE */
  fulltext?: boolean;
  page: number;
  pageSize: number;
}

/**
 * 把用户输入转成 BOOLEAN MODE 查询：每个词加前缀通配，提升中文 ngram 命中率。
 * 必须剔除 BOOLEAN MODE 的操作符（+ - > < ( ) ~ * " @），否则会出现
 * "+ +word" 这类非法语法导致 SQL 报错（E2E 就是这么发现的）。
 */
export function toBooleanQuery(keyword: string): string {
  const words = keyword
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[+\-><()~*"@]/g, '').trim())
    .filter((word) => word.length > 0)
    .slice(0, 8);
  if (words.length === 0) return '';
  // 中文不要加 * 通配：ngram 解析器按 2 字切词，带通配的多字词会整体匹配失败
  // （实测「管理」「系统」「脚手架」在 ngram + 通配下均为 0 命中，去掉通配即正常）
  const CJK = /[\u4e00-\u9fa5\u3040-\u30ff]/;
  return words.map((word) => '+' + word + (CJK.test(word) ? '' : '*')).join(' ');
}

interface ArticleRow extends RowDataPacket {
  id: number;
  title: string;
  summary: string;
  content: string;
  cover_img: string;
  category_id: number | null;
  user_id: number;
  status: number;
  audit_status: number;
  audit_remark: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * 列表查询入口：全文检索若 0 命中则自动回退 LIKE。
 * ngram 分词 + 用户输入存在天然的“查不到”场景，回退可保证结果不劣于 LIKE。
 */
export async function listArticles(params: ListArticleParams, user: { id: number; permissions: string[] }) {
  if (params.fulltext && params.keyword) {
    const fulltextResult = await queryArticles({ ...params, fulltext: true }, user);
    if (fulltextResult.total > 0) return fulltextResult;
    return queryArticles({ ...params, fulltext: false }, user);
  }
  return queryArticles(params, user);
}

async function queryArticles(params: ListArticleParams, user: { id: number; permissions: string[] }) {
  // 回收站看已删除的，普通列表看未删除的
  const where: string[] = [params.trashed ? 'a.deleted_at IS NOT NULL' : 'a.deleted_at IS NULL'];
  const args: unknown[] = [];

  // 无查看全站权限的用户只能看到自己的文章
  if (!canViewAllContent(user) || params.onlyMine) {
    where.push('a.user_id = ?');
    args.push(user.id);
  }
  if (params.keyword) {
    const booleanQuery = params.fulltext ? toBooleanQuery(params.keyword) : '';
    if (params.fulltext && booleanQuery) {
      where.push('MATCH (a.title, a.summary, a.content) AGAINST (? IN BOOLEAN MODE)');
      args.push(booleanQuery);
    } else {
      where.push('(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)');
      const like = '%' + params.keyword + '%';
      args.push(like, like, like);
    }
  }
  if (params.status !== undefined) {
    where.push('a.status = ?');
    args.push(params.status);
  }
  if (params.categoryId !== undefined) {
    where.push('a.category_id = ?');
    args.push(params.categoryId);
  }
  if (params.authorId !== undefined) {
    where.push('a.user_id = ?');
    args.push(params.authorId);
  }
  if (params.tagId !== undefined) {
    where.push('EXISTS (SELECT 1 FROM article_tags at WHERE at.article_id = a.id AND at.tag_id = ?)');
    args.push(params.tagId);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM articles a WHERE ' + whereSql,
    args
  );

  const orderBy =
    params.sortBy === 'views'
      ? 'a.view_count DESC, a.id DESC'
      : params.sortBy === 'likes'
        ? 'a.like_count DESC, a.id DESC'
        : params.sortBy === 'created'
          ? 'a.created_at DESC, a.id DESC'
          : 'a.updated_at DESC, a.id DESC';

  const list = await query<ArticleListItem & RowDataPacket>(
    'SELECT a.id, a.title, a.summary, a.cover_img AS coverImg, a.status, a.category_id AS categoryId, c.name AS categoryName, ' +
      'a.user_id AS authorId, u.nickname AS authorName, a.audit_remark AS auditRemark, ' +
      'a.view_count AS viewCount, a.like_count AS likeCount, ' +
      'a.comment_count AS commentCount, a.publish_at AS publishAt, a.updated_at AS updatedAt, ' +
      "COALESCE((SELECT GROUP_CONCAT(t.name ORDER BY t.id SEPARATOR '、') FROM article_tags at JOIN tags t ON t.id = at.tag_id WHERE at.article_id = a.id), '') AS tags, " +
      // 机器判定（最近一条审核记录），供「机器判定」列展示
      "(SELECT ar.decision FROM audit_records ar WHERE ar.target_type = 'article' AND ar.target_id = a.id ORDER BY ar.id DESC LIMIT 1) AS auditDecision, " +
      "(SELECT ar.hit_words FROM audit_records ar WHERE ar.target_type = 'article' AND ar.target_id = a.id ORDER BY ar.id DESC LIMIT 1) AS auditHitWords " +
      'FROM articles a LEFT JOIN categories c ON c.id = a.category_id LEFT JOIN users u ON u.id = a.user_id ' +
      'WHERE ' + whereSql + ' ORDER BY ' + orderBy + ' LIMIT ? OFFSET ?',
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );

  return { list, total: Number(totalRow?.total ?? 0) };
}

/** 创作中心数据概览：我的文章按状态计数 + 累计互动数据 */
export async function getMyStats(userId: number) {
  const row = await queryOne<RowDataPacket & {
    total: number; draft: number; pending: number; published: number; rejected: number; offline: number;
    views: number; likes: number; favorites: number; comments: number;
  }>(
    'SELECT COUNT(*) AS total, ' +
      'SUM(status = 0) AS draft, SUM(status = 1) AS pending, SUM(status = 2) AS published, ' +
      'SUM(status = 3) AS rejected, SUM(status = 4) AS offline, ' +
      'COALESCE(SUM(view_count), 0) AS views, COALESCE(SUM(like_count), 0) AS likes, ' +
      'COALESCE(SUM(favorite_count), 0) AS favorites, COALESCE(SUM(comment_count), 0) AS comments ' +
      'FROM articles WHERE user_id = ? AND deleted_at IS NULL',
    [userId]
  );
  const [recycle] = await query<RowDataPacket & { total: number }>(
    'SELECT COUNT(*) AS total FROM articles WHERE user_id = ? AND deleted_at IS NOT NULL',
    [userId]
  );
  return {
    total: Number(row?.total ?? 0),
    draft: Number(row?.draft ?? 0),
    pending: Number(row?.pending ?? 0),
    published: Number(row?.published ?? 0),
    rejected: Number(row?.rejected ?? 0),
    offline: Number(row?.offline ?? 0),
    views: Number(row?.views ?? 0),
    likes: Number(row?.likes ?? 0),
    favorites: Number(row?.favorites ?? 0),
    comments: Number(row?.comments ?? 0),
    recycled: Number(recycle?.total ?? 0)
  };
}

/** 复制为新草稿：标题加「（副本）」，不复制互动数据与历史版本 */
export async function duplicateArticle(id: number, user: { id: number; permissions: string[] }) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (article.user_id !== user.id && !canViewAllContent(user)) throw AppError.forbidden('只能复制自己的文章');

  const tagRows = await query<RowDataPacket & { tag_id: number }>('SELECT tag_id FROM article_tags WHERE article_id = ?', [id]);

  return withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT INTO articles (title, summary, content, cover_img, category_id, user_id, status, audit_status) VALUES (?, ?, ?, ?, ?, ?, ?, 0)',
      [article.title + '（副本）', article.summary, article.content, article.cover_img, article.category_id, user.id, ArticleStatus.DRAFT]
    );
    const newId = Number(result.insertId);
    if (tagRows.length > 0) {
      await conn.query('INSERT IGNORE INTO article_tags (article_id, tag_id) VALUES ?', [tagRows.map((row) => [newId, row.tag_id])]);
    }
    return { id: newId, title: article.title + '（副本）' };
  });
}

/** 从回收站恢复 */
/** 取文章归属（权限判断用） */
export async function getArticleOwner(id: number) {
  const row = await queryOne<RowDataPacket & { user_id: number }>(
    'SELECT user_id FROM articles WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  return row ? { userId: Number(row.user_id) } : null;
}

export async function restoreArticle(id: number, user: { id: number; permissions: string[] }) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ?', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (article.deleted_at === null) throw AppError.badRequest('该文章未被删除');
  if (article.user_id !== user.id && !canManageOthersContent(user)) throw AppError.forbidden('只能恢复自己的文章');

  await execute('UPDATE articles SET deleted_at = NULL, status = ? WHERE id = ?', [ArticleStatus.DRAFT, id]);
  return { id, status: ArticleStatus.DRAFT };
}

export async function getArticleDetail(id: number, user: { id: number; permissions: string[] }, withContent = true) {
  const article = await queryOne<ArticleRow>(
    'SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL',
    [id]
  );
  if (!article) throw AppError.notFound('文章不存在');
  if (article.user_id !== user.id && !canViewAllContent(user)) {
    throw AppError.forbidden('只能查看自己的文章');
  }

  const [category, author, tags, versions, liked, favorited] = await Promise.all([
    article.category_id
      ? queryOne<RowDataPacket & { id: number; name: string }>('SELECT id, name FROM categories WHERE id = ?', [article.category_id])
      : Promise.resolve(null),
    queryOne<RowDataPacket & { id: number; nickname: string }>('SELECT id, nickname FROM users WHERE id = ?', [article.user_id]),
    query<RowDataPacket & { id: number; name: string; color: string }>(
      'SELECT t.id, t.name, t.color FROM tags t JOIN article_tags at ON at.tag_id = t.id WHERE at.article_id = ? ORDER BY t.id ASC',
      [id]
    ),
    queryOne<RowDataPacket & { total: number }>(
      'SELECT COALESCE(MAX(version), 0) AS total FROM article_versions WHERE article_id = ?',
      [id]
    ),
    queryOne<RowDataPacket>('SELECT 1 AS hit FROM article_likes WHERE article_id = ? AND user_id = ?', [id, user.id]),
    queryOne<RowDataPacket>('SELECT 1 AS hit FROM article_favorites WHERE article_id = ? AND user_id = ?', [id, user.id])
  ]);

  return {
    id: Number(article.id),
    title: article.title,
    summary: article.summary,
    content: withContent ? article.content : undefined,
    coverImg: article.cover_img,
    categoryId: article.category_id,
    categoryName: category?.name ?? null,
    authorId: article.user_id,
    authorName: author?.nickname ?? '',
    status: Number(article.status),
    auditStatus: Number(article.audit_status),
    auditRemark: article.audit_remark,
    viewCount: Number(article.view_count),
    likeCount: Number(article.like_count),
    commentCount: Number(article.comment_count),
    publishAt: article.publish_at,
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    tags,
    versionCount: Number(versions?.total ?? 0),
    favoriteCount: Number(article.favorite_count ?? 0),
    liked: Boolean(liked),
    favorited: Boolean(favorited),
    // 由服务端判定「这篇能不能编辑」，前端不要用本地权限缓存去猜
    canEdit: canEditOwnArticle({ userId: Number(article.user_id) }, user),
    // 质量体检：编辑器打开已保存的文章时立刻有分，不必等 debounce 请求
    quality: evaluateArticleQuality({
      title: article.title,
      summary: article.summary,
      content: article.content,
      coverImg: article.cover_img,
      categoryId: article.category_id,
      tagIds: tags.map((tag) => Number(tag.id))
    })
  };
}

async function setArticleTags(conn: PoolConnection, articleId: number, tagIds: number[]): Promise<void> {
  await conn.query('DELETE FROM article_tags WHERE article_id = ?', [articleId]);
  const unique = [...new Set(tagIds)].filter((tagId) => Number.isInteger(tagId) && tagId > 0);
  if (unique.length > 0) {
    await conn.query('INSERT INTO article_tags (article_id, tag_id) VALUES ?', [unique.map((tagId) => [articleId, tagId])]);
  }
}

/**
 * 自动审核并回写状态（新建提交与再次提交共用同一套逻辑）。
 * 结论：pass=自动发布 / reject=自动驳回 / review=转人工。
 */
async function applyAutoAudit(
  article: { id: number; title: string; summary?: string | null; content?: string | null },
  userId: number
) {
  const text = [article.title, article.summary ?? '', article.content ?? ''].join('\n');
  const verdict = await moderation.moderate(userId, text, 'article');

  const status =
    verdict.decision === 'pass'
      ? ArticleStatus.PUBLISHED
      : verdict.decision === 'reject'
        ? ArticleStatus.REJECTED
        : ArticleStatus.PENDING;
  const auditStatus = verdict.decision === 'pass' ? 2 : verdict.decision === 'reject' ? 3 : 1;

  await execute('UPDATE articles SET status = ?, audit_status = ?, audit_remark = ?, publish_at = ? WHERE id = ?', [
    status,
    auditStatus,
    verdict.reason,
    verdict.decision === 'pass' ? new Date() : null,
    article.id
  ]);

  await moderation.recordAutoAudit({ targetType: 'article', targetId: article.id, result: verdict });

  if (verdict.decision === 'reject') {
    await moderation.penalizeUser(userId);
  }
  if (verdict.decision !== 'review') {
    await moderation.notifyAuthor({ userId, articleId: article.id, title: article.title, result: verdict });
  }

  return {
    id: article.id,
    status,
    decision: verdict.decision,
    reason: verdict.reason,
    hits: verdict.hits.map((hit) => hit.word)
  };
}

export async function createArticle(input: {
  title: string;
  summary?: string;
  content: string;
  coverImg?: string;
  categoryId?: number | null;
  tagIds?: number[];
  submit?: boolean;
}, userId: number) {
  const status = input.submit ? ArticleStatus.PENDING : ArticleStatus.DRAFT;
  const created = await withTransaction(async (conn) => {
    const [result] = await conn.query<import('mysql2').ResultSetHeader>(
      'INSERT INTO articles (title, summary, content, cover_img, category_id, user_id, status, audit_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [input.title, input.summary ?? '', input.content, input.coverImg ?? '', input.categoryId ?? null, userId, status, input.submit ? 1 : 0]
    );
    const articleId = Number(result.insertId);
    await setArticleTags(conn, articleId, input.tagIds ?? []);
    return { id: articleId, status };
  });

  // 直接「保存并提交审核」时同样要过自动审核，否则会绕过词库
  if (input.submit) {
    return applyAutoAudit(
      { id: created.id, title: input.title, summary: input.summary, content: input.content },
      userId
    );
  }
  return created;
}

/** 更新文章：先把旧内容快照进 article_versions（老系统的历史版本能力保留并规范化） */
export async function updateArticle(id: number, input: {
  title?: string;
  summary?: string;
  content?: string;
  coverImg?: string;
  categoryId?: number | null;
  tagIds?: number[];
}, user: { id: number; permissions: string[] }) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (article.user_id !== user.id && !canManageOthersContent(user)) throw AppError.forbidden('只能编辑自己的文章');
  if (Number(article.status) === ArticleStatus.PENDING) throw AppError.badRequest('文章处于待审核状态，不能修改');

  return withTransaction(async (conn) => {
    const [versionRow] = await conn.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM article_versions WHERE article_id = ?',
      [id]
    );
    const nextVersion = Number((versionRow[0] as { nextVersion: number }).nextVersion);

    await conn.query(
      'INSERT INTO article_versions (article_id, version, title, summary, content, cover_img, category_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, nextVersion, article.title, article.summary, article.content, article.cover_img, article.category_id, article.status, user.id]
    );

    const fields: string[] = [];
    const args: unknown[] = [];
    if (input.title !== undefined) { fields.push('title = ?'); args.push(input.title); }
    if (input.summary !== undefined) { fields.push('summary = ?'); args.push(input.summary); }
    if (input.content !== undefined) { fields.push('content = ?'); args.push(input.content); }
    if (input.coverImg !== undefined) { fields.push('cover_img = ?'); args.push(input.coverImg); }
    if (input.categoryId !== undefined) { fields.push('category_id = ?'); args.push(input.categoryId); }
    if (fields.length > 0) {
      await conn.query('UPDATE articles SET ' + fields.join(', ') + ' WHERE id = ?', [...args, id]);
    }
    if (input.tagIds !== undefined) await setArticleTags(conn, id, input.tagIds);
    return { id, version: nextVersion };
  });
}

export async function submitForAudit(id: number, user: { id: number; permissions: string[] }) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (article.user_id !== user.id && !canManageOthersContent(user)) throw AppError.forbidden('只能提交自己的文章');
  if (Number(article.status) === ArticleStatus.PENDING) throw AppError.badRequest('文章已在待审核队列中');
  if (Number(article.status) === ArticleStatus.PUBLISHED) throw AppError.badRequest('已发布的文章无需再次提交审核');

  return applyAutoAudit(
    { id, title: article.title, summary: article.summary, content: article.content },
    user.id
  );
}

export async function auditArticle(
  id: number,
  input: { approved: boolean; remark?: string },
  actor?: { id: number; nickname: string }
) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (Number(article.status) !== ArticleStatus.PENDING) throw AppError.badRequest('只有待审核的文章可以审核');

  const status = input.approved ? ArticleStatus.PUBLISHED : ArticleStatus.REJECTED;
  await execute(
    'UPDATE articles SET status = ?, audit_status = ?, audit_remark = ?, publish_at = ? WHERE id = ?',
    [status, input.approved ? 2 : 3, input.remark ?? '', input.approved ? new Date() : null, id]
  );

  await moderation.recordManualAudit({
    targetType: 'article',
    targetId: id,
    approved: input.approved,
    operatorId: actor?.id ?? 0,
    remark: input.remark
  });

  // 审核结果通知作者（自己审自己不会产生通知）
  await notify({
    userId: article.user_id,
    type: 'audit',
    title: input.approved ? '文章审核通过：' + article.title : '文章被驳回：' + article.title,
    content: input.approved ? '文章已发布上线' : (input.remark || '请根据审核意见修改后重新提交'),
    link: '/content/articles/' + id + '/edit',
    actorId: actor?.id ?? null
  });

  return { id, status };
}

export async function publishArticle(id: number, publish: boolean) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (publish && Number(article.status) === ArticleStatus.PENDING) throw AppError.badRequest('待审核文章需先通过审核');

  const status = publish ? ArticleStatus.PUBLISHED : ArticleStatus.OFFLINE;
  await execute('UPDATE articles SET status = ?, publish_at = COALESCE(publish_at, ?) WHERE id = ?', [
    status,
    publish ? new Date() : null,
    id
  ]);
  return { id, status };
}

export async function deleteArticle(id: number, user: { id: number; permissions: string[] }) {
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!article) throw AppError.notFound('文章不存在');
  if (article.user_id !== user.id && !canManageOthersContent(user)) throw AppError.forbidden('只能删除自己的文章');

  await execute('UPDATE articles SET deleted_at = NOW() WHERE id = ?', [id]);
  return { id };
}

export async function listVersions(articleId: number) {
  await assertArticleExists(articleId);
  return query<RowDataPacket>(
    'SELECT v.id, v.version, v.title, v.status, v.created_by AS createdBy, u.nickname AS createdByName, v.created_at AS createdAt ' +
      'FROM article_versions v LEFT JOIN users u ON u.id = v.created_by ' +
      'WHERE v.article_id = ? ORDER BY v.version DESC',
    [articleId]
  );
}

async function assertArticleExists(articleId: number): Promise<void> {
  const article = await queryOne<RowDataPacket>('SELECT id FROM articles WHERE id = ? AND deleted_at IS NULL', [articleId]);
  if (!article) throw AppError.notFound('文章不存在');
}

export async function getVersion(articleId: number, versionId: number) {
  const row = await queryOne<RowDataPacket & { title: string; summary: string; content: string; version: number; createdAt: string }>(
    'SELECT id, version, title, summary, content, cover_img AS coverImg, status, created_at AS createdAt ' +
      'FROM article_versions WHERE id = ? AND article_id = ?',
    [versionId, articleId]
  );
  if (!row) throw AppError.notFound('历史版本不存在');
  return row;
}

/** 恢复历史版本：先把当前内容存为新版本，再把选中版本回写主表 */
export async function restoreVersion(articleId: number, versionId: number, user: { id: number; permissions: string[] }) {
  const target = await queryOne<RowAndVersion>('SELECT * FROM article_versions WHERE id = ? AND article_id = ?', [versionId, articleId]);
  if (!target) throw AppError.notFound('历史版本不存在');
  const article = await queryOne<ArticleRow>('SELECT * FROM articles WHERE id = ? AND deleted_at IS NULL', [articleId]);
  if (!article) throw AppError.notFound('文章不存在');
  if (article.user_id !== user.id && !canManageOthersContent(user)) throw AppError.forbidden('只能恢复自己的文章版本');

  return withTransaction(async (conn) => {
    const [rows] = await conn.query<RowDataPacket[]>(
      'SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM article_versions WHERE article_id = ?',
      [articleId]
    );
    const nextVersion = Number((rows[0] as { nextVersion: number }).nextVersion);
    await conn.query(
      'INSERT INTO article_versions (article_id, version, title, summary, content, cover_img, category_id, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [articleId, nextVersion, article.title, article.summary, article.content, article.cover_img, article.category_id, article.status, user.id]
    );
    await conn.query(
      'UPDATE articles SET title = ?, summary = ?, content = ?, cover_img = ?, category_id = ?, status = ? WHERE id = ?',
      [target.title, target.summary, target.content, target.cover_img, target.category_id, ArticleStatus.DRAFT, articleId]
    );
    return { id: articleId, restoredFrom: Number(target.version), newVersion: nextVersion };
  });
}

interface RowAndVersion extends RowDataPacket {
  version: number;
  title: string;
  summary: string;
  content: string;
  cover_img: string;
  category_id: number | null;
  status: number;
}

export async function diffVersions(articleId: number, fromVersion: number, toVersion: number) {
  const [from, to] = await Promise.all([
    queryOne<RowAndVersion>('SELECT * FROM article_versions WHERE article_id = ? AND version = ?', [articleId, fromVersion]),
    queryOne<RowAndVersion>('SELECT * FROM article_versions WHERE article_id = ? AND version = ?', [articleId, toVersion])
  ]);
  if (!from || !to) throw AppError.notFound('参与对比的版本不存在');

  const titleDiff = diffLines(from.title, to.title);
  const contentDiff = diffLines(from.content, to.content);
  return {
    from: { version: from.version, title: from.title, createdAt: undefined },
    to: { version: to.version, title: to.title },
    title: { added: titleDiff.added, removed: titleDiff.removed, lines: titleDiff.lines },
    content: { added: contentDiff.added, removed: contentDiff.removed, truncated: contentDiff.truncated, lines: contentDiff.lines }
  };
}

export async function incrementViewCount(id: number): Promise<void> {
  await execute('UPDATE articles SET view_count = view_count + 1 WHERE id = ? AND deleted_at IS NULL', [id]);
}