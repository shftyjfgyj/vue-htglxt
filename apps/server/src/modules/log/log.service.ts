import type { RowDataPacket } from 'mysql2';
import { query, queryOne } from '../../db/pool.js';

export interface LogQuery {
  keyword?: string;
  module?: string;
  success?: number;
  page: number;
  pageSize: number;
}

export async function listOperationLogs(params: LogQuery) {
  const where: string[] = ['1 = 1'];
  const args: unknown[] = [];
  if (params.keyword) {
    where.push('(username LIKE ? OR action LIKE ? OR path LIKE ?)');
    const like = `%${params.keyword}%`;
    args.push(like, like, like);
  }
  if (params.module) {
    where.push('module = ?');
    args.push(params.module);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>(`SELECT COUNT(*) AS total FROM operation_logs WHERE ${whereSql}`, args);
  const list = await query<RowDataPacket>(
    `SELECT id, user_id AS userId, username, module, action, target, method, path, ip, status,
            detail, created_at AS createdAt
     FROM operation_logs WHERE ${whereSql}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );
  return { list, total: Number(totalRow?.total ?? 0) };
}

export async function listLoginLogs(params: LogQuery) {
  const where: string[] = ['1 = 1'];
  const args: unknown[] = [];
  if (params.keyword) {
    where.push('(username LIKE ? OR ip LIKE ?)');
    const like = `%${params.keyword}%`;
    args.push(like, like);
  }
  if (params.success !== undefined) {
    where.push('success = ?');
    args.push(params.success);
  }
  const whereSql = where.join(' AND ');

  const totalRow = await queryOne<RowDataPacket & { total: number }>(`SELECT COUNT(*) AS total FROM login_logs WHERE ${whereSql}`, args);
  const list = await query<RowDataPacket>(
    `SELECT id, user_id AS userId, username, ip, user_agent AS userAgent, success, message, created_at AS createdAt
     FROM login_logs WHERE ${whereSql}
     ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...args, params.pageSize, (params.page - 1) * params.pageSize]
  );
  return { list, total: Number(totalRow?.total ?? 0) };
}
