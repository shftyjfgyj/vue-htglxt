import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ErrorCode } from '../common/errors.js';
import { logger } from '../common/logger.js';
import { isProd } from '../config/env.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    code: ErrorCode.NOT_FOUND,
    message: `接口不存在：${req.method} ${req.path}`,
    data: null,
    traceId: (res.locals.traceId as string) ?? ''
  });
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  const traceId = (res.locals.traceId as string) ?? '';
  const userId = req.user?.id;

  if (error instanceof AppError) {
    logger.warn({ traceId, path: req.originalUrl, code: error.code, message: error.message, userId }, '业务异常');
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      data: error.details ?? null,
      traceId
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(ErrorCode.UNPROCESSABLE).json({
      code: ErrorCode.UNPROCESSABLE,
      message: '参数校验失败',
      data: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      traceId
    });
    return;
  }

  const err = error as Error & { code?: string; sqlMessage?: string };
  if (err?.code === 'ER_DUP_ENTRY') {
    res.status(ErrorCode.CONFLICT).json({ code: ErrorCode.CONFLICT, message: '数据已存在（唯一约束冲突）', data: null, traceId });
    return;
  }

  logger.error({ traceId, path: req.originalUrl, err }, '未捕获异常');
  res.status(ErrorCode.INTERNAL).json({
    code: ErrorCode.INTERNAL,
    message: '服务器内部错误',
    data: isProd ? null : { name: err?.name, message: err?.message, sqlMessage: err?.sqlMessage },
    traceId
  });
};
