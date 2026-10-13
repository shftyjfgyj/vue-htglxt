import { del, get, post, put } from './http';
import type { PermissionGroup, RoleItem } from '@/types';

export function listRoles() {
  return get<RoleItem[]>('/api/v1/roles');
}

export function getRole(id: number) {
  return get<RoleItem & { permissionIds: number[] }>('/api/v1/roles/' + id);
}

export function createRole(data: { code: string; name: string; description?: string; permissionIds?: number[] }) {
  return post<{ id: number }>('/api/v1/roles', data);
}

export function updateRole(id: number, data: { name?: string; description?: string }) {
  return put<{ id: number }>('/api/v1/roles/' + id, data);
}

export function removeRole(id: number) {
  return del<{ id: number }>('/api/v1/roles/' + id);
}

export function getRolePermissions(id: number) {
  return get<number[]>('/api/v1/roles/' + id + '/permissions');
}

export function setRolePermissions(id: number, permissionIds: number[]) {
  return put<{ id: number; permissionCount: number }>('/api/v1/roles/' + id + '/permissions', { permissionIds });
}

export function listPermissions() {
  return get<PermissionGroup[]>('/api/v1/roles/permissions/all');
}
