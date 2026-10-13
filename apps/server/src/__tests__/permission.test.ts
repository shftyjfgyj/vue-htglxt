import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/errors.js';
import { requirePermission, requireRole } from '../middleware/permission.js';
import type { AuthUser } from '../modules/auth/auth.service.js';

function mockReq(user?: Partial<AuthUser>): Request {
  return { user: user as AuthUser } as unknown as Request;
}

function run(handler: ReturnType<typeof requirePermission>, req: Request) {
  const next = vi.fn();
  (handler as unknown as (a: Request, b: Response, c: NextFunction) => void)(req, {} as Response, next as unknown as NextFunction);
  return next;
}

describe('RBAC 中间件', () => {
  it('超级管理员（通配权限）可以通过任意权限校验', () => {
    const next = run(requirePermission('user:delete'), mockReq({ permissions: ['*'], roles: ['admin'] }));
    expect(next).toHaveBeenCalledWith();
  });

  it('普通用户命中权限码才放行，否则 403', () => {
    const allowed = run(requirePermission('article:list'), mockReq({ permissions: ['article:list'], roles: ['editor'] }));
    expect(allowed).toHaveBeenCalledWith();

    const denied = run(requirePermission('user:delete'), mockReq({ permissions: ['article:list'], roles: ['editor'] }));
    const error = denied.mock.calls[0]?.[0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.status).toBe(403);
  });

  it('未登录返回 401', () => {
    const next = run(requirePermission('article:list'), mockReq(undefined));
    expect((next.mock.calls[0]?.[0] as AppError).status).toBe(401);
  });

  it('requireRole 命中角色或 admin 放行', () => {
    const byRole = run(requireRole('editor'), mockReq({ roles: ['editor'], permissions: [] }));
    expect(byRole).toHaveBeenCalledWith();

    const byAdmin = run(requireRole('editor'), mockReq({ roles: ['admin'], permissions: ['*'] }));
    expect(byAdmin).toHaveBeenCalledWith();

    const denied = run(requireRole('editor'), mockReq({ roles: ['viewer'], permissions: [] }));
    expect((denied.mock.calls[0]?.[0] as AppError).status).toBe(403);
  });
});
