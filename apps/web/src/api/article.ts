import { del, get, http, post, put } from './http';
import type {
  ArticleDetail, ArticleItem, ArticleVersion, AuditRecord, BatchResult, CommentNode, DiffResult, ImportSummary, MyArticleStats, PageResult, QualityReport, RelatedArticle
} from '../types/content';

export interface ArticleQuery {
  keyword?: string;
  status?: number;
  categoryId?: number;
  tagId?: number;
  onlyMine?: boolean;
  fulltext?: boolean;
  /** 回收站视图 */
  trashed?: boolean;
  sortBy?: 'updated' | 'created' | 'views' | 'likes';
  page?: number;
  pageSize?: number;
}

export function listArticles(params: ArticleQuery) {
  return get<PageResult<ArticleItem>>('/api/v1/articles', params as Record<string, unknown>);
}

export function getArticle(id: number) {
  return get<ArticleDetail>('/api/v1/articles/' + id);
}

export interface ArticlePayload {
  title: string;
  summary?: string;
  content: string;
  coverImg?: string;
  categoryId?: number | null;
  tagIds?: number[];
  submit?: boolean;
}

export function createArticle(data: ArticlePayload) {
  return post<{ id: number; status: number; decision?: 'pass' | 'reject' | 'review'; reason?: string; hits?: string[] }>(
    '/api/v1/articles',
    data
  );
}

export function updateArticle(id: number, data: Partial<ArticlePayload>) {
  return put<{ id: number; version: number }>('/api/v1/articles/' + id, data);
}

export function deleteArticle(id: number) {
  return del<{ id: number }>('/api/v1/articles/' + id);
}

/** 质量体检预览：不落库，编辑器 debounce 调用 */
export function previewQuality(data: {
  title?: string;
  summary?: string;
  content?: string;
  coverImg?: string;
  categoryId?: number | null;
  tagIds?: number[];
}) {
  return post<QualityReport>('/api/v1/articles/quality-preview', data);
}

export interface SubmitResult {
  id: number;
  status: number;
  /** 自动审核结论：pass=自动发布 / reject=自动驳回 / review=转人工 */
  decision?: 'pass' | 'reject' | 'review';
  reason?: string;
  hits?: string[];
}

export function submitArticle(id: number) {
  return post<SubmitResult>('/api/v1/articles/' + id + '/submit');
}

export function auditArticle(id: number, data: { approved: boolean; remark?: string }) {
  return post<{ id: number; status: number }>('/api/v1/articles/' + id + '/audit', data);
}

export function publishArticle(id: number, publish: boolean) {
  return post<{ id: number; status: number }>('/api/v1/articles/' + id + '/publish', { publish });
}

export function listVersions(articleId: number) {
  return get<ArticleVersion[]>('/api/v1/articles/' + articleId + '/versions');
}

export function getVersionContent(articleId: number, versionId: number) {
  return get<{ id: number; version: number; title: string; summary: string; content: string; createdAt: string }>(
    '/api/v1/articles/' + articleId + '/versions/' + versionId
  );
}

export function restoreVersion(articleId: number, versionId: number) {
  return post<{ restoredFrom: number; newVersion: number }>('/api/v1/articles/' + articleId + '/versions/' + versionId + '/restore');
}

export function diffVersions(articleId: number, from: number, to: number) {
  return get<DiffResult>('/api/v1/articles/' + articleId + '/versions/diff', { from, to });
}
/** 批量操作：delete/category/publish/offline/addTags/removeTags/submit */
export function batchOperate(data: {
  ids: number[];
  action: 'delete' | 'category' | 'publish' | 'offline' | 'addTags' | 'removeTags' | 'submit';
  categoryId?: number | null;
  tagIds?: number[];
}) {
  return post<BatchResult>('/api/v1/articles/batch', data);
}

/** 导出 Excel（返回 Blob，由调用方触发下载） */
export async function exportArticles(params: { keyword?: string; status?: number; categoryId?: number }) {
  const response = await http.get('/api/v1/articles/export', { params, responseType: 'blob' });
  return response.data as Blob;
}

/** 下载导入模板 */
export async function downloadImportTemplate() {
  const response = await http.get('/api/v1/articles/import/template', { responseType: 'blob' });
  return response.data as Blob;
}

/** 导入 Excel（xlsx / csv） */
export async function importArticles(file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await http.post<{ data: ImportSummary }>('/api/v1/articles/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

/** 创作中心：我的文章数据概览 */
export function myArticleStats() {
  return get<MyArticleStats>('/api/v1/articles/mine/stats');
}

/** 审核记录时间线（机器 + 人工） */
export function articleAuditRecords(id: number) {
  return get<AuditRecord[]>('/api/v1/articles/' + id + '/audit-records');
}

/** 复制为新草稿 */
export function duplicateArticle(id: number) {
  return post<{ id: number; title: string }>('/api/v1/articles/' + id + '/duplicate');
}

/** 从回收站恢复 */
export function restoreArticle(id: number) {
  return post<{ id: number; status: number }>('/api/v1/articles/' + id + '/restore');
}

/** 相关文章推荐（同分类或共享标签） */
export function listRelatedArticles(articleId: number, limit = 5) {
  return get<RelatedArticle[]>('/api/v1/articles/' + articleId + '/related', { limit });
}

/** 读者视角的评论树（楼中楼） */
export function listArticleComments(articleId: number) {
  return get<CommentNode[]>('/api/v1/articles/' + articleId + '/comments');
}

