import type { Request, Response } from 'express';
import { created, ok } from '../../common/http.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import * as roleService from './role.service.js';

export const list = asyncHandler(async (_req: Request, res: Response) => ok(res, await roleService.listRoles()));

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const role = await roleService.getRole(id);
  const permissionIds = await roleService.getRolePermissionIds(id);
  return ok(res, { ...role, permissionIds });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const result = await roleService.createRole(req.body);
  return created(res, result, '角色创建成功');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  return ok(res, await roleService.updateRole(id, req.body), '角色已更新');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  return ok(res, await roleService.deleteRole(id), '角色已删除');
});

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await roleService.getRole(id);
  return ok(res, await roleService.getRolePermissionIds(id));
});

export const setPermissions = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { permissionIds } = req.body as { permissionIds: number[] };
  return ok(res, await roleService.setRolePermissions(id, permissionIds), '角色权限已更新');
});

export const listAllPermissions = asyncHandler(async (_req: Request, res: Response) =>
  ok(res, await roleService.listPermissions())
);
