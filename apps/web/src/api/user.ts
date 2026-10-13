import { del, get, http, post, put } from './http';
import type { PageResult, UserDetail, UserItem } from '@/types';

export interface UserQuery {
  keyword?: string;
  status?: number;
  page?: number;
  pageSize?: number;
}

export function listUsers(params: UserQuery) {
  return get<PageResult<UserItem>>('/api/v1/users', params as Record<string, unknown>);
}

export function getUser(id: number) {
  return get<UserDetail>('/api/v1/users/' + id);
}

export function createUser(data: {
  username: string;
  password: string;
  nickname?: string;
  email?: string;
  status?: number;
  /** 角色必选：服务端要求至少一个，避免建出零权限账号 */
  roleIds: number[];
}) {
  return post<{ id: number }>('/api/v1/users', data);
}

export function updateUser(id: number, data: { nickname?: string; email?: string; avatar?: string }) {
  return put<{ id: number }>('/api/v1/users/' + id, data);
}

export function setUserStatus(id: number, status: number) {
  return put<{ id: number; status: number }>('/api/v1/users/' + id + '/status', { status });
}

/** 信任设置：强制可信 / 清除违规记录（自动审核的运营开关） */
export function setUserTrust(id: number, data: { autoAudit?: boolean; resetViolations?: boolean }) {
  return put<{ id: number; autoAudit?: boolean; resetViolations: boolean }>('/api/v1/users/' + id + '/trust', data);
}

export function resetUserPassword(id: number, newPassword: string) {
  return put<{ id: number; revokedSessions: number }>('/api/v1/users/' + id + '/password', { newPassword });
}

export function removeUser(id: number) {
  return del<{ id: number }>('/api/v1/users/' + id);
}

export function updateMe(data: { nickname?: string; email?: string; avatar?: string }) {
  return put<{ id: number }>('/api/v1/users/me', data);
}

/** 头像上传：服务端会校验类型与大小，并清理旧头像文件 */
export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append('file', file);
  const response = await http.post<{ data: { id: number; avatar: string } }>('/api/v1/users/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return response.data.data;
}

export function getUserRoles(id: number) {
  return get<Array<{ id: number; code: string; name: string }>>('/api/v1/users/' + id + '/roles');
}

export function setUserRoles(id: number, roleIds: number[]) {
  return put<{ userId: number; roleIds: number[] }>('/api/v1/users/' + id + '/roles', { roleIds });
}
