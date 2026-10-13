import type { Response } from 'express';
import { ErrorCode } from './errors.js';

export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T | null;
  traceId: string;
}

function traceIdOf(res: Response): string {
  return (res.locals.traceId as string) ?? '';
}

export function ok<T>(res: Response, data: T = null as T, message = 'ok'): Response {
  return res.json({ code: ErrorCode.OK, message, data, traceId: traceIdOf(res) } satisfies ApiResponse<T>);
}

export function created<T>(res: Response, data: T = null as T, message = '创建成功'): Response {
  return res.status(201).json({ code: ErrorCode.OK, message, data, traceId: traceIdOf(res) } satisfies ApiResponse<T>);
}

export function fail(res: Response, message: string, status = 400, code = status, details?: unknown): Response {
  return res.status(status).json({ code, message, data: details ?? null, traceId: traceIdOf(res) });
}
