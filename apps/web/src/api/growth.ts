import { get } from './http';
import type { AchievementsResult, HeatmapResult } from '../types/content';

/** 创作热力图 + 连续创作天数（数据边界：本人） */
export function fetchHeatmap(days = 365) {
  return get<HeatmapResult>('/api/v1/growth/heatmap', { days });
}

/** 成就徽章墙（数据边界：本人） */
export function fetchAchievements() {
  return get<AchievementsResult>('/api/v1/growth/achievements');
}
