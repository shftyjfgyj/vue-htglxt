import { del, get, post, put } from './http';
import type { FeedArticle, FollowUser, LibraryArticle, PageResult } from '../types/content';

export function likeArticle(articleId: number) {
  return post<{ articleId: number; liked: boolean }>('/api/v1/articles/' + articleId + '/like');
}

export function unlikeArticle(articleId: number) {
  return del<{ articleId: number; liked: boolean }>('/api/v1/articles/' + articleId + '/like');
}

export function followUser(userId: number) {
  return post<{ followingId: number; following: boolean }>('/api/v1/users/' + userId + '/follow');
}

export function unfollowUser(userId: number) {
  return del<{ followingId: number; following: boolean }>('/api/v1/users/' + userId + '/follow');
}

export function favoriteArticle(articleId: number, folder?: string) {
  return post<{ articleId: number; favorited: boolean }>('/api/v1/articles/' + articleId + '/favorite', folder ? { folder } : undefined);
}

export function unfavoriteArticle(articleId: number) {
  return del<{ articleId: number; favorited: boolean }>('/api/v1/articles/' + articleId + '/favorite');
}

/** 我的收藏 / 我的点赞（同一结构，便于复用列表组件） */
export function myFavorites(params: { page?: number; pageSize?: number; folder?: string } = {}) {
  return get<PageResult<LibraryArticle>>('/api/v1/me/favorites', params as Record<string, unknown>);
}

export function myLikes(params: { page?: number; pageSize?: number } = {}) {
  return get<PageResult<LibraryArticle>>('/api/v1/me/likes', params as Record<string, unknown>);
}

/** 最近在看（阅读历史） */
export function myHistory(params: { page?: number; pageSize?: number } = {}) {
  return get<PageResult<LibraryArticle>>('/api/v1/me/history', params as Record<string, unknown>);
}

/** 关注动态：我关注的作者发布的文章 */
export function myFeed(params: { page?: number; pageSize?: number } = {}) {
  return get<PageResult<FeedArticle>>('/api/v1/me/feed', params as Record<string, unknown>);
}

/** 收藏分组 */
export function favoriteFolders() {
  return get<Array<{ folder: string; total: number }>>('/api/v1/me/favorite-folders');
}

export function moveFavoriteFolder(articleId: number, folder: string) {
  return put<{ articleId: number; folder: string }>('/api/v1/me/favorites/' + articleId + '/folder', { folder });
}

/** 关注状态与计数（阅读页「关注作者」按钮用） */
export function followStatus(userId: number) {
  return get<{ following: boolean; followedBy: boolean; mutual: boolean; followers: number; followingCount: number }>(
    '/api/v1/users/' + userId + '/follow-status'
  );
}

export function myFollowing() {
  return get<FollowUser[]>('/api/v1/me/following');
}

export function myFollowers() {
  return get<FollowUser[]>('/api/v1/me/followers');
}

export function myMutual() {
  return get<FollowUser[]>('/api/v1/me/mutual');
}
