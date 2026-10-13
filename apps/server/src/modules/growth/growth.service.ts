/**
 * 个人成长数据：创作热力图、连续创作天数、成就徽章。
 *
 * 全部由现有表实时算出（articles / article_tags），不新增任何表——
 * 因此成就没有「首次达成时间」，只表达「是否达成 + 还差多少」。
 */
import type { RowDataPacket } from 'mysql2';
import { query, queryOne } from '../../db/pool.js';

export interface HeatmapDay {
  day: string;
  count: number;
}

export interface HeatmapResult {
  days: HeatmapDay[];
  total: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  maxCount: number;
}

export interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: string;
  group: string;
  target: number;
  current: number;
  unlocked: boolean;
}

function dayKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

/** 'YYYY-MM-DD' → 天数序号；用 UTC 计算避免夏令时把「相邻两天」算错 */
function dayNumber(day: string): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, (month ?? 1) - 1, date ?? 1) / 86_400_000;
}

/**
 * 连续创作天数：
 * - current：从今天（今天没写就从昨天）往前连续有产出的天数；
 *   昨天没写则视为断掉，返回 0。
 * - longest：历史最长连续段。
 */
export function computeStreaks(dayStrings: string[]): { current: number; longest: number } {
  const set = new Set(dayStrings);
  if (set.size === 0) return { current: 0, longest: 0 };

  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    run = previous !== null && dayNumber(day) - dayNumber(previous) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    previous = day;
  }

  const cursor = new Date();
  if (!set.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(dayKey(cursor))) return { current: 0, longest };
  }

  let current = 0;
  while (set.has(dayKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { current, longest };
}

/** 我的创作热力图：最近 N 天每天的发文数（草稿也算，创作本身就是产出） */
export async function myHeatmap(userId: number, days: number): Promise<HeatmapResult> {
  const [windowRows, allDayRows] = await Promise.all([
    query<RowDataPacket & { day: string; total: number }>(
      'SELECT DATE(created_at) AS day, COUNT(*) AS total FROM articles ' +
        'WHERE user_id = ? AND deleted_at IS NULL AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY) ' +
        'GROUP BY DATE(created_at)',
      [userId, days - 1]
    ),
    query<RowDataPacket & { day: string }>(
      'SELECT DATE(created_at) AS day FROM articles ' +
        'WHERE user_id = ? AND deleted_at IS NULL GROUP BY DATE(created_at)',
      [userId]
    )
  ]);

  const countByDay = new Map(windowRows.map((row) => [String(row.day), Number(row.total)]));
  const result: HeatmapDay[] = [];
  let total = 0;
  let maxCount = 0;
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - offset);
    const key = dayKey(date);
    const count = countByDay.get(key) ?? 0;
    total += count;
    if (count > maxCount) maxCount = count;
    result.push({ day: key, count });
  }

  const streaks = computeStreaks(allDayRows.map((row) => String(row.day)));
  return {
    days: result,
    total,
    activeDays: result.filter((item) => item.count > 0).length,
    currentStreak: streaks.current,
    longestStreak: streaks.longest,
    maxCount
  };
}

interface Metrics {
  publishedCount: number;
  views: number;
  likes: number;
  favorites: number;
  commentsReceived: number;
  tagCount: number;
  longestStreak: number;
  currentStreak: number;
}

interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  group: string;
  target: number;
  metric: (metrics: Metrics) => number;
}

/** 徽章定义：能直接用现有字段算出来的，才放进来 */
const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_article', name: '初次发声', description: '发布第 1 篇文章', icon: '🌱', group: '创作', target: 1, metric: (m) => m.publishedCount },
  { code: 'ten_articles', name: '笔耕不辍', description: '累计发布 10 篇文章', icon: '✍️', group: '创作', target: 10, metric: (m) => m.publishedCount },
  { code: 'fifty_articles', name: '著作等身', description: '累计发布 50 篇文章', icon: '📚', group: '创作', target: 50, metric: (m) => m.publishedCount },
  { code: 'views_1000', name: '千次阅读', description: '文章被阅读 1000 次', icon: '👀', group: '影响力', target: 1000, metric: (m) => m.views },
  { code: 'likes_100', name: '百人点赞', description: '累计获得 100 个赞', icon: '👍', group: '影响力', target: 100, metric: (m) => m.likes },
  { code: 'favorites_50', name: '值得收藏', description: '文章被收藏 50 次', icon: '⭐', group: '影响力', target: 50, metric: (m) => m.favorites },
  { code: 'comments_50', name: '引发讨论', description: '累计收到 50 条评论', icon: '💬', group: '影响力', target: 50, metric: (m) => m.commentsReceived },
  { code: 'tags_10', name: '涉猎广泛', description: '用满 10 个不同标签', icon: '🏷️', group: '影响力', target: 10, metric: (m) => m.tagCount },
  { code: 'streak_3', name: '三日不辍', description: '连续 3 天创作', icon: '🔥', group: '坚持', target: 3, metric: (m) => m.longestStreak },
  { code: 'streak_7', name: '七日不辍', description: '连续 7 天创作', icon: '🔥', group: '坚持', target: 7, metric: (m) => m.longestStreak },
  { code: 'streak_30', name: '三十日不辍', description: '连续 30 天创作', icon: '🏆', group: '坚持', target: 30, metric: (m) => m.longestStreak }
];

export async function myAchievements(userId: number): Promise<{ unlockedCount: number; total: number; list: Achievement[] }> {
  const [stats, tagRow, dayRows] = await Promise.all([
    queryOne<RowDataPacket & { publishedCount: number; views: number; likes: number; favorites: number; commentsReceived: number }>(
      'SELECT COUNT(*) AS publishedCount, COALESCE(SUM(view_count), 0) AS views, ' +
        'COALESCE(SUM(like_count), 0) AS likes, COALESCE(SUM(favorite_count), 0) AS favorites, ' +
        'COALESCE(SUM(comment_count), 0) AS commentsReceived ' +
        'FROM articles WHERE user_id = ? AND deleted_at IS NULL AND status = 2',
      [userId]
    ),
    queryOne<RowDataPacket & { tagCount: number }>(
      'SELECT COUNT(DISTINCT at.tag_id) AS tagCount FROM articles a ' +
        'JOIN article_tags at ON at.article_id = a.id ' +
        'WHERE a.user_id = ? AND a.deleted_at IS NULL AND a.status = 2',
      [userId]
    ),
    query<RowDataPacket & { day: string }>(
      'SELECT DATE(created_at) AS day FROM articles WHERE user_id = ? AND deleted_at IS NULL GROUP BY DATE(created_at)',
      [userId]
    )
  ]);

  const streaks = computeStreaks(dayRows.map((row) => String(row.day)));
  const metrics: Metrics = {
    publishedCount: Number(stats?.publishedCount ?? 0),
    views: Number(stats?.views ?? 0),
    likes: Number(stats?.likes ?? 0),
    favorites: Number(stats?.favorites ?? 0),
    commentsReceived: Number(stats?.commentsReceived ?? 0),
    tagCount: Number(tagRow?.tagCount ?? 0),
    longestStreak: streaks.longest,
    currentStreak: streaks.current
  };

  const list: Achievement[] = ACHIEVEMENTS.map((def) => {
    const value = def.metric(metrics);
    return {
      code: def.code,
      name: def.name,
      description: def.description,
      icon: def.icon,
      group: def.group,
      target: def.target,
      current: Math.min(value, def.target),
      unlocked: value >= def.target
    };
  });

  return {
    unlockedCount: list.filter((item) => item.unlocked).length,
    total: list.length,
    list
  };
}
