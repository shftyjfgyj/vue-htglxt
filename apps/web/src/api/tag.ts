import { del, get, post, put } from './http';
import type { TagItem } from '../types/content';

export function listTags() {
  return get<TagItem[]>('/api/v1/tags');
}

export function listPopularTags(limit = 10) {
  return get<TagItem[]>('/api/v1/tags/popular', { limit });
}

export function createTag(data: { name: string; color?: string }) {
  return post<{ id: number }>('/api/v1/tags', data);
}

export function updateTag(id: number, data: { name?: string; color?: string }) {
  return put<{ id: number }>('/api/v1/tags/' + id, data);
}

export function removeTag(id: number) {
  return del<{ id: number }>('/api/v1/tags/' + id);
}
