import { del, get, post, put } from './http';

export type WordLevel = 'block' | 'review' | 'replace';

export interface SensitiveWord {
  id: number;
  word: string;
  category: string;
  level: WordLevel;
  enabled: number;
  remark: string;
  hitCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WordStats {
  total: number;
  byLevel: Array<{ level: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  topHits: Array<{ word: string; hits: number }>;
}

export interface WordTestResult {
  decision: 'pass' | 'review' | 'reject';
  hits: Array<{ id: number; word: string; category: string; level: WordLevel }>;
  summary: string;
}

export function listWords(params: { keyword?: string; category?: string; level?: WordLevel; enabled?: '0' | '1'; page?: number; pageSize?: number } = {}) {
  return get<{ list: SensitiveWord[]; total: number; page: number; pageSize: number }>('/api/v1/sensitive-words', params as Record<string, unknown>);
}

export function wordStats() {
  return get<WordStats>('/api/v1/sensitive-words/stats');
}

export function wordCategories() {
  return get<string[]>('/api/v1/sensitive-words/categories');
}

export function createWord(data: { word: string; category?: string; level?: WordLevel; remark?: string; enabled?: boolean }) {
  return post<{ id: number; word: string }>('/api/v1/sensitive-words', data);
}

export function updateWord(id: number, data: Partial<{ word: string; category: string; level: WordLevel; remark: string; enabled: boolean }>) {
  return put<{ id: number }>('/api/v1/sensitive-words/' + id, data);
}

export function deleteWord(id: number) {
  return del<{ id: number }>('/api/v1/sensitive-words/' + id);
}

export function importWords(data: { words: string; category?: string; level?: WordLevel }) {
  return post<{ total: number; added: number; skipped: number; invalid: string[] }>('/api/v1/sensitive-words/import', data);
}

export function testWords(text: string) {
  return post<WordTestResult>('/api/v1/sensitive-words/test', { text });
}
