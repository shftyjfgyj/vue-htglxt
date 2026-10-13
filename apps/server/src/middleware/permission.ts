import type { RequestHandler } from 'express';
import { AppError } from '../common/errors.js';

/** 拥有 * 通配权限（超级管理员）或命中任一权限码即放行 */
export function requirePermission(...codes: string[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(AppError.unauthorized());
    const granted = user.permissions.includes('*') || codes.some((code) => user.permissions.includes(code));
    if (!granted) {
      return next(AppError.forbidden(`缺少权限：${codes.join(' 或 ')}`));
    }
    next();
  };
}

export function requireRole(...roleCodes: string[]): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(AppError.unauthorized());
    if (user.roles.includes('admin') || roleCodes.some((code) => user.roles.includes(code))) {
      return next();
    }
    next(AppError.forbidden(`需要角色：${roleCodes.join(' 或 ')}`));
  };
}
