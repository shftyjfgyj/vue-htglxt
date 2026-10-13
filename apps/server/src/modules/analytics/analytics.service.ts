/**
 * 运营分析：审核效能、标签共现、兴趣画像、作者排行。
 *
 * 这些都是「数据已经在库里、但没有出口」的部分：
 * - 审核侧：audit_records 一直在写（机器判定 + 人工处置），此前只能逐条看，没有聚合视图
 * - 标签共现 / 兴趣画像 / 作者排行：纯读已有表，不新增结构
 */
import type { RowDataPacket } from 'mysql2';
import { query, queryOne } from '../../db/pool.js';

const DECISION_LABELS: Record<string, string> = {
  auto_pass: '机器自动通过',
  auto_reject: '机器自动驳回',
  to_review: '转人工审核',
  manual_pass: '人工通过',
  manual_reject: '人工驳回'
};

const DECISION_ORDER = ['auto_pass', 'to_review', 'auto_reject', 'manual_pass', 'manual_reject'];

function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

/** 审核效能：机器/人工占比、决策分布、审核员处理量、审核量趋势、待处理积压 */
export async function moderationOverview(days: number) {
  const [decisionRows, operatorRows, targetRows, staffRows, trendRows, backlog] = await Promise.all([
    query<RowDataPacket & { decision: string; n: number }>(
      'SELECT decision, COUNT(*) AS n FROM audit_records GROUP BY decision'
    ),
    query<RowDataPacket & { operator_type: string; n: number }>(
      'SELECT operator_type, COUNT(*) AS n FROM audit_records GROUP BY operator_type'
    ),
    query<RowDataPacket & { target_type: string; n: number }>(
      'SELECT target_type, COUNT(*) AS n FROM audit_records GROUP BY target_type'
    ),
    query<RowDataPacket & { operator_id: number; nickname: string; n: number; approved: number; rejected: number }>(
      'SELECT ar.operator_id, u.nickname, COUNT(*) AS n, ' +
        "COALESCE(SUM(ar.decision = 'manual_pass'), 0) AS approved, " +
        "COALESCE(SUM(ar.decision = 'manual_reject'), 0) AS rejected " +
        'FROM audit_records ar LEFT JOIN users u ON u.id = ar.operator_id ' +
        "WHERE ar.operator_type = 'user' AND ar.operator_id IS NOT NULL " +
        'GROUP BY ar.operator_id, u.nickname ORDER BY n DESC LIMIT 10'
    ),
    query<RowDataPacket & { day: string; total: number; auto: number; manual: number }>(
      'SELECT DATE(created_at) AS day, COUNT(*) AS total, ' +
        "COALESCE(SUM(operator_type = 'system'), 0) AS auto, " +
        "COALESCE(SUM(operator_type = 'user'), 0) AS manual " +
        'FROM audit_records WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) GROUP BY DATE(created_at)',
      [days - 1]
    ),
    queryOne<RowDataPacket & { pendingArticles: number; pendingComments: number }>(
      'SELECT (SELECT COUNT(*) FROM articles WHERE status = 1 AND deleted_at IS NULL) AS pendingArticles, ' +
        '(SELECT COUNT(*) FROM comments WHERE audit_status = 0 AND deleted_at IS NULL) AS pendingComments'
    )
  ]);

  const decisionMap = new Map(decisionRows.map((row) => [String(row.decision), Number(row.n)]));
  const decisions = DECISION_ORDER.map((decision) => ({
    decision,
    label: DECISION_LABELS[decision] ?? decision,
    count: decisionMap.get(decision) ?? 0
  })).filter((item) => item.count > 0);

  const typeMap = new Map(operatorRows.map((row) => [String(row.operator_type), Number(row.n)]));
  const system = typeMap.get('system') ?? 0;
  const user = typeMap.get('user') ?? 0;
  const total = system + user;

  const trendMap = new Map(trendRows.map((row) => [String(row.day), row]));
  const trend: Array<{ day: string; total: number; auto: number; manual: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const hit = trendMap.get(key);
    trend.push({
      day: key,
      total: Number(hit?.total ?? 0),
      auto: Number(hit?.auto ?? 0),
      manual: Number(hit?.manual ?? 0)
    });
  }

  return {
    total,
    pendingArticles: Number(backlog?.pendingArticles ?? 0),
    pendingComments: Number(backlog?.pendingComments ?? 0),
    autoRate: total === 0 ? 0 : Math.round((system / total) * 100),
    decisions,
    byOperator: { system, user },
    byTarget: targetRows.map((row) => ({ targetType: String(row.target_type), count: Number(row.n) })),
    operators: staffRows.map((row) => ({
      id: Number(row.operator_id),
      name: row.nickname ?? '已删除用户',
      count: Number(row.n),
      approved: Number(row.approved),
      rejected: Number(row.rejected)
    })),
    trend
  };
}

/** 标签共现图谱：同一篇已发布文章里一起出现过的标签对 */
export async function tagGraph(limit: number) {
  const [nodeRows, linkRows] = await Promise.all([
    query<RowDataPacket & { id: number; name: string; color: string; value: number }>(
      'SELECT t.id, t.name, t.color, COUNT(a.id) AS value ' +
        'FROM tags t ' +
        'JOIN article_tags at ON at.tag_id = t.id ' +
        'JOIN articles a ON a.id = at.article_id AND a.deleted_at IS NULL AND a.status = 2 ' +
        'WHERE t.deleted_at IS NULL GROUP BY t.id, t.name, t.color HAVING value > 0 ORDER BY value DESC LIMIT ?',
      [limit]
    ),
    query<RowDataPacket & { a: number; b: number; w: number }>(
      'SELECT t1.tag_id AS a, t2.tag_id AS b, COUNT(*) AS w ' +
        'FROM article_tags t1 ' +
        'JOIN article_tags t2 ON t2.article_id = t1.article_id AND t2.tag_id > t1.tag_id ' +
        'JOIN articles ar ON ar.id = t1.article_id AND ar.deleted_at IS NULL AND ar.status = 2 ' +
        'GROUP BY t1.tag_id, t2.tag_id ORDER BY w DESC LIMIT 200'
    )
  ]);

  const nameById = new Map(nodeRows.map((row) => [Number(row.id), String(row.name)]));
  // 只保留两端都在节点集合里的边，否则 ECharts 会画出孤立端点
  const links = linkRows
    .filter((row) => nameById.has(Number(row.a)) && nameById.has(Number(row.b)))
    .map((row) => ({ source: nameById.get(Number(row.a))!, target: nameById.get(Number(row.b))!, value: Number(row.w) }));

  return {
    nodes: nodeRows.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      color: row.color || '',
      value: Number(row.value)
    })),
    links
  };
}

/**
 * 兴趣画像：当前用户在各个分类上的涉猎广度。
 * 用 UNION 去重后按「读过的不同文章数」计，避免同一篇既读又赞又收藏被算三次。
 */
export async function interestRadar(userId: number, limit: number) {
  const rows = await query<RowDataPacket & { name: string; value: number }>(
    'SELECT COALESCE(c.name, "未分类") AS name, COUNT(DISTINCT a.id) AS value ' +
      'FROM (' +
      '  SELECT article_id FROM article_view_logs WHERE user_id = ?' +
      '  UNION SELECT article_id FROM article_likes WHERE user_id = ?' +
      '  UNION SELECT article_id FROM article_favorites WHERE user_id = ?' +
      ') e ' +
      'JOIN articles a ON a.id = e.article_id AND a.deleted_at IS NULL ' +
      'LEFT JOIN categories c ON c.id = a.category_id ' +
      'GROUP BY name ORDER BY value DESC LIMIT ?',
    [userId, userId, userId, limit]
  );

  return {
    items: rows.map((row) => ({ name: String(row.name), value: Number(row.value) })),
    total: rows.reduce((sum, row) => sum + Number(row.value), 0)
  };
}

export type RankingPeriod = 'week' | 'month' | 'all';

/** 作者排行：浏览 1 分、点赞 3 分、评论 2 分加权 */
export async function authorRanking(period: RankingPeriod, limit: number) {
  const args: unknown[] = [];
  let where = 'a.deleted_at IS NULL AND a.status = 2';
  if (period === 'week') {
    where += ' AND COALESCE(a.publish_at, a.created_at) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
  } else if (period === 'month') {
    where += ' AND COALESCE(a.publish_at, a.created_at) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)';
  }

  const rows = await query<RowDataPacket & {
    id: number; nickname: string; avatar: string; articles: number; views: number; likes: number; comments: number; score: number;
  }>(
    'SELECT u.id, u.nickname, u.avatar, COUNT(a.id) AS articles, ' +
      'COALESCE(SUM(a.view_count), 0) AS views, ' +
      'COALESCE(SUM(a.like_count), 0) AS likes, ' +
      'COALESCE(SUM(a.comment_count), 0) AS comments, ' +
      '(COALESCE(SUM(a.view_count), 0) + COALESCE(SUM(a.like_count), 0) * 3 + COALESCE(SUM(a.comment_count), 0) * 2) AS score ' +
      'FROM users u JOIN articles a ON a.user_id = u.id ' +
      'WHERE ' + where + ' AND u.deleted_at IS NULL ' +
      'GROUP BY u.id, u.nickname, u.avatar ORDER BY score DESC, articles DESC LIMIT ?',
    [...args, limit]
  );

  return rows.map((row, index) => ({
    rank: index + 1,
    id: Number(row.id),
    nickname: String(row.nickname),
    avatar: row.avatar ?? '',
    articles: Number(row.articles),
    views: Number(row.views),
    likes: Number(row.likes),
    comments: Number(row.comments),
    score: Number(row.score)
  }));
}
