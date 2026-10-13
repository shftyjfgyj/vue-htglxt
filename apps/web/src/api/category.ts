import { del, get, post, put } from './http';
import type { CategoryItem } from '../types/content';

export function listCategories() {
  return get<CategoryItem[]>('/api/v1/categories');
}

export function createCategory(data: { name: string; alias: string; sort?: number }) {
  return post<{ id: number }>('/api/v1/categories', data);
}

export function updateCategory(id: number, data: { name?: string; alias?: string; sort?: number }) {
  return put<{ id: number }>('/api/v1/categories/' + id, data);
}

export function removeCategory(id: number) {
  return del<{ id: number }>('/api/v1/categories/' + id);
}
