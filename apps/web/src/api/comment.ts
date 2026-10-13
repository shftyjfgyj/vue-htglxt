import { del, get, post, put } from './http';
import type { AuditRecord, CommentItem, PageResult } from '../types/content';

export function listComments(params: { articleId?: number; auditStatus?: number; keyword?: string; userId?: number; page?: number; pageSize?: number }) {
  return get<PageResult<CommentItem>>('/api/v1/comments', params as Record<string, unknown>);
}

export function auditComment(id: number, auditStatus: number) {
  return put<{ id: number; auditStatus: number }>('/api/v1/comments/' + id + '/audit', { auditStatus });
}

/** 评论审核记录时间线 */
export function commentAuditRecords(id: number) {
  return get<AuditRecord[]>('/api/v1/comments/' + id + '/audit-records');
}

export function removeComment(id: number) {
  return del<{ id: number }>('/api/v1/comments/' + id);
}

/** 点赞 / 取消点赞（幂等，重复点赞不会重复计数） */
export function likeComment(id: number) {
  return post<{ commentId: number; liked: boolean }>('/api/v1/comments/' + id + '/like', {});
}

export function unlikeComment(id: number) {
  return del<{ commentId: number; liked: boolean }>('/api/v1/comments/' + id + '/like');
}

export function createComment(data: { articleId: number; content: string; parentId?: number | null }) {
  return post<{
    id: number;
    /** 0=待审核 1=已通过 2=已拒绝 */
    auditStatus: number;
    decision: 'pass' | 'reject' | 'review';
    reason: string;
  }>('/api/v1/comments', data);
}
