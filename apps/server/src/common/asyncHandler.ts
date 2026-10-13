import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** 把 async 处理函数抛出的异常交给 Express 错误中间件 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
