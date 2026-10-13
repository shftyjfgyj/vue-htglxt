import { get, http } from './http';
import type { DashboardOverview, PopularArticle, TrendPoint } from '../types/content';

export function fetchOverview() {
  return get<DashboardOverview>('/api/v1/dashboard/overview');
}

export function fetchTrend(days = 7) {
  return get<TrendPoint[]>('/api/v1/dashboard/trend', { days });
}

export function fetchPopularArticles() {
  return get<PopularArticle[]>('/api/v1/dashboard/popular');
}

/** 导出 PDF 数据报表（二进制流，由调用方触发下载） */
export async function downloadReport(days = 7): Promise<Blob> {
  const response = await http.get('/api/v1/dashboard/report.pdf', { params: { days }, responseType: 'blob' });
  return response.data as Blob;
}
