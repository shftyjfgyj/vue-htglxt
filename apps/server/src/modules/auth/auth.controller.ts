import type { Request, Response } from 'express';
import { ok } from '../../common/http.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { AppError } from '../../common/errors.js';
import * as authService from './auth.service.js';
import type { ChangePasswordInput, LoginInput, RefreshInput } from './auth.schema.js';

function clientMeta(req: Request): { ip: string | null; userAgent: string | null } {
  return {
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip ?? null,
    userAgent: req.header('user-agent') ?? null
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as LoginInput;
  const result = await authService.login({ ...body, ...clientMeta(req) });
  return ok(res, result, '登录成功');
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = req.body as RefreshInput;
  const meta = clientMeta(req);
  const result = await authService.refresh(refreshToken, meta.ip, meta.userAgent);
  return ok(res, result, '令牌已刷新');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const { refreshToken } = (req.body ?? {}) as { refreshToken?: string };
  const result = await authService.logout(user.id, refreshToken);
  return ok(res, result, '已退出登录');
});

export const profile = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const fresh = await authService.getAuthUser(user.id);
  if (!fresh) throw AppError.unauthorized();
  return ok(res, fresh);
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw AppError.unauthorized();
  const body = req.body as ChangePasswordInput;
  await authService.changeOwnPassword(user.id, body.oldPassword, body.newPassword);
  return ok(res, null, '密码已修改，请重新登录');
});
