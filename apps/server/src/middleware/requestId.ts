import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

/** 为每个请求生成 traceId，贯穿响应体与日志，便于排查 */
export const requestId: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-trace-id');
  const traceId = incoming && incoming.length <= 64 ? incoming : randomUUID();
  res.locals.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  next();
};
