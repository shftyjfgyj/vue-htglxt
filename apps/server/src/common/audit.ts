import type { RequestHandler, Response } from 'express';
import { execute } from '../db/pool.js';
import { logger } from '../common/logger.js';

interface AuditOptions {
  module: string;
  action: string;
  /** 从请求中解析操作对象，例如 user:12 */
  target?: (req: Parameters<RequestHandler>[0]) => string | undefined;
  /** 记录请求体摘要（会自动剔除敏感字段） */
  withBody?: boolean;
}

const SENSITIVE_KEYS = ['password', 'newPassword', 'oldPassword', 'refreshToken', 'token'];

function sanitize(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.includes(k) ? '***' : sanitize(v);
  }
  return out;
}

/**
 * 写操作审计：响应结束后异步落 operation_logs。
 * 审计失败不能影响主流程，只记日志。
 */
export function audit(options: AuditOptions): RequestHandler {
  return (req, res: Response, next) => {
    res.on('finish', () => {
      const detail = options.withBody && req.body ? JSON.stringify(sanitize(req.body)).slice(0, 2000) : null;
      const record = {
        user_id: req.user?.id ?? null,
        username: req.user?.username ?? null,
        module: options.module,
        action: options.action,
        target: options.target?.(req) ?? null,
        method: req.method,
        path: req.originalUrl.slice(0, 255),
        ip: req.ip ?? null,
        status: res.statusCode,
        detail
      };
      execute(
        `INSERT INTO operation_logs (user_id, username, module, action, target, method, path, ip, status, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [record.user_id, record.username, record.module, record.action, record.target, record.method, record.path, record.ip, record.status, record.detail]
      ).catch((error) => logger.error({ error }, '写入操作日志失败'));
    });
    next();
  };
}
