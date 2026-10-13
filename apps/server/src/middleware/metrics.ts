import type { RequestHandler } from 'express';
import { httpRequestDuration, httpRequestErrors, httpRequestsTotal } from '../common/metrics.js';
import { logger } from '../common/logger.js';

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS ?? 1000);

/** 归一化路径：把数字 / UUID 段替换成 :id，避免标签基数爆炸（Express 的 req.route 在 finish 阶段可能已被还原） */
export function normalizePath(url: string): string {
  const path = (url.split('?')[0] ?? '/').split('#')[0] ?? '/';
  return path
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    .replace(/\/\d+/g, '/:id');
}

/** 记录请求量、错误数与耗时；慢请求额外打 warn 日志，便于定位性能问题 */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = normalizePath(req.originalUrl);
    const labels = { method: req.method, route, status: String(res.statusCode) };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe({ method: req.method, route }, seconds);
    if (res.statusCode >= 400) httpRequestErrors.inc(labels);

    const ms = Math.round(seconds * 1000);
    if (ms >= SLOW_REQUEST_MS) {
      logger.warn({ method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: ms }, '慢请求');
    }
  });

  next();
};
