/** 与后端共享的数据结构（后端 docs/API.md 为契约来源） */

export interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
  traceId: string;
}

export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthUser {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  status: number;
  roles: string[];
  permissions: string[];
  email?: string;
  lastLoginAt?: string | null;
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface UserItem {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
  status: number;
  roles: string;
  createdAt: string;
  lastLoginAt: string | null;
  /** 管理员强制信任（自动审核直接发布） */
  autoAudit?: number;
  /** 违规次数（命中违禁词自动驳回时累加） */
  violationCount?: number;
  lastViolationAt?: string | null;
}

export interface UserDetail {
  id: number;
  username: string;
  nickname: string;
  email: string;
  avatar: string;
  status: number;
  createdAt: string;
  lastLoginAt: string | null;
  roles: Array<{ id: number; code: string; name: string }>;
}

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description: string;
  isSystem: number;
  permissionCount: number;
  userCount: number;
  createdAt: string;
}

export interface PermissionGroup {
  module: string;
  permissions: Array<{ id: number; code: string; name: string; type: string }>;
}

export interface MenuNode {
  id: number;
  name: string;
  path: string | null;
  icon: string | null;
  sort: number;
  permissionCode: string | null;
  children: MenuNode[];
}

export interface OperationLogItem {
  id: number;
  userId: number | null;
  username: string | null;
  module: string;
  action: string;
  target: string | null;
  method: string;
  path: string;
  ip: string | null;
  status: number;
  detail: string | null;
  createdAt: string;
}

export interface LoginLogItem {
  id: number;
  userId: number | null;
  username: string;
  ip: string | null;
  userAgent: string | null;
  success: number;
  message: string;
  createdAt: string;
}
