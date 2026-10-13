import { get } from './http';
import type { AuthorRankItem, InterestRadar, ModerationOverview, TagGraph } from '../types/content';

/** 审核效能（需 article:audit / comment:audit） */
export function fetchModeration(days = 30) {
  return get<ModerationOverview>('/api/v1/analytics/moderation', { days });
}

/** 标签共现图谱 */
export function fetchTagGraph(limit = 30) {
  return get<TagGraph>('/api/v1/analytics/tag-graph', { limit });
}

/** 兴趣画像（本人数据） */
export function fetchInterest(limit = 8) {
  return get<InterestRadar>('/api/v1/analytics/interest', { limit });
}

/** 作者排行榜 */
export function fetchAuthorRanking(period: 'week' | 'month' | 'all' = 'all', limit = 10) {
  return get<AuthorRankItem[]>('/api/v1/analytics/author-ranking', { period, limit });
}
