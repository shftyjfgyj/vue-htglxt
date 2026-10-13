import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env.js';
import { buildDbSsl } from '../config/db-ssl.js';
import { logger } from '../common/logger.js';
import { registerPoolSizeProvider } from '../common/metrics.js';

/** 全局唯一的 MySQL 连接池（老系统有两个重复连接池，这里统一） */
export const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: buildDbSsl(),
  waitForConnections: true,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  dateStrings: ['DATETIME', 'DATE'],
  namedPlaceholders: false
});

// 供 /metrics 暴露连接池规模（mysql2 未提供公开统计 API，这里做防御性读取）
registerPoolSizeProvider(() => {
  const internal = (pool as unknown as { pool?: { _allConnections?: unknown[] } }).pool;
  return internal?._allConnections?.length ?? 0;
});

export async function query<T extends RowDataPacket | Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  return rows as unknown as T[];
}

export async function queryOne<T extends RowDataPacket | Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0]! : null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await pool.query<ResultSetHeader>(sql, params);
  return result;
}

/** 事务包装：回调抛错自动回滚 */
export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function pingDb(): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end().catch((error) => logger.error({ error }, '关闭连接池失败'));
}
