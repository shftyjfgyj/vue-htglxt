import { get } from './http';
import type { LoginLogItem, OperationLogItem, PageResult } from '@/types';

export function listOperationLogs(params: { keyword?: string; module?: string; page?: number; pageSize?: number }) {
  return get<PageResult<OperationLogItem>>('/api/v1/logs/operation', params as Record<string, unknown>);
}

export function listLoginLogs(params: { keyword?: string; success?: number; page?: number; pageSize?: number }) {
  return get<PageResult<LoginLogItem>>('/api/v1/logs/login', params as Record<string, unknown>);
}
