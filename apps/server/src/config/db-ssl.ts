/**
 * 数据库 TLS 配置的唯一来源。
 *
 * 单独成模块是为了让「连接池」和「迁移脚本」共用同一份逻辑 ——
 * 迁移脚本自己 createConnection，早期就漏了 ssl 选项，
 * 结果本地 5.7 连得上、Aiven / RDS 这类强制 SSL 的库直接连不上。
 */
import fs from 'node:fs';
import { env } from './env.js';

export function buildDbSsl(): Record<string, unknown> | undefined {
  if (env.DB_SSL === 'disable') return undefined;
  if (env.DB_SSL === 'require') {
    // 加密传输，但不校验证书链（够用且省事；更严格用 verify）
    return { rejectUnauthorized: false };
  }
  const raw = String(env.DB_SSL_CA ?? '').trim();
  // 允许「直接贴 PEM 内容」或「填证书文件路径」两种写法
  const ca = raw.includes('BEGIN CERTIFICATE') ? raw : fs.readFileSync(raw, 'utf8');
  return { rejectUnauthorized: true, ca };
}
