import { get, post, put } from './http';
import type { AuthUser, LoginResult } from '@/types';

export function login(data: { username: string; password: string }) {
  return post<LoginResult>('/api/v1/auth/login', data);
}

export function logout(refreshToken?: string) {
  return post<{ revoked: number }>('/api/v1/auth/logout', { refreshToken });
}

export function fetchProfile() {
  return get<AuthUser>('/api/v1/auth/profile');
}

export function changeMyPassword(data: { oldPassword: string; newPassword: string }) {
  return put<null>('/api/v1/auth/password', data);
}
