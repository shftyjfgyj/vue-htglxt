import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../common/errors.js';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/** 用 zod 校验并「覆写」req.body/query/params，业务层拿到的即校验后的值 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, _res, next) => {
    const issues: Array<{ path: string; message: string }> = [];
    const targets: Array<['body' | 'query' | 'params', ZodTypeAny | undefined]> = [
      ['body', schemas.body],
      ['query', schemas.query],
      ['params', schemas.params]
    ];

    for (const [key, schema] of targets) {
      if (!schema) continue;
      const parsed = schema.safeParse(req[key]);
      if (parsed.success) {
        if (key === 'query') {
          Object.defineProperty(req, 'query', { value: parsed.data, writable: true, configurable: true });
        } else {
          req[key] = parsed.data as never;
        }
      } else {
        for (const issue of parsed.error.issues) {
          issues.push({ path: `${key}.${issue.path.join('.')}`, message: issue.message });
        }
      }
    }

    if (issues.length > 0) {
      return next(AppError.unprocessable('参数校验失败', issues));
    }
    next();
  };
}
