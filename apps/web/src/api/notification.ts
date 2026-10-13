import { del, get, put } from './http';
import type { NotificationItem, PageResult } from '../types/content';

export function listNotifications(params: { isRead?: number; page?: number; pageSize?: number }) {
  return get<PageResult<NotificationItem>>('/api/v1/notifications', params as Record<string, unknown>);
}

export function unreadCount() {
  return get<{ total: number }>('/api/v1/notifications/unread-count');
}

export function markRead(ids: number[]) {
  return put<{ updated: number }>('/api/v1/notifications/read', { ids });
}

export function markAllRead() {
  return put<{ updated: number }>('/api/v1/notifications/read-all');
}

export function removeNotification(id: number) {
  return del<null>('/api/v1/notifications/' + id);
}
