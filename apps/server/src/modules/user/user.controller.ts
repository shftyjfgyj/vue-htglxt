import type { Request, Response } from 'express';
import { created, ok } from '../../common/http.js';
import { pageResult } from '../../common/pagination.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { AppError } from '../../common/errors.js';
import * as userService from './user.service.js';
import { extensionOf } from '../upload/upload.middleware.js';
import { storage } from '../upload/storage.js';
import * as roleService from '../role/role.service.js';
import type { CreateUserInput, ListUserQuery, UpdateUserInput } from './user.schema.js';

function currentId(req: Request): number {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListUserQuery;
  const { list, total } = await userService.listUsers(query);
  return ok(res, pageResult(list, total, query.page, query.pageSize));
});

export const detail = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  return ok(res, await userService.getUserDetail(id));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as CreateUserInput;
  const result = await userService.createUser(body);
  return created(res, result, '用户创建成功');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const body = req.body as UpdateUserInput;
  return ok(res, await userService.updateUser(id, body), '用户已更新');
});

export const setStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status: number };
  return ok(res, await userService.setStatus(id, status, currentId(req)), status === 1 ? '用户已启用' : '用户已停用并强制下线');
});

export const setTrust = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as { autoAudit?: boolean; resetViolations?: boolean };
  return ok(res, await userService.setTrust(Number(req.params.id), body), '信任设置已更新');
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { newPassword } = req.body as { newPassword: string };
  return ok(res, await userService.resetPassword(id, newPassword), '密码已重置，该用户所有会话已失效');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  return ok(res, await userService.softDeleteUser(id, currentId(req)), '用户已删除');
});

export const assignRoles = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { roleIds } = req.body as { roleIds: number[] };
  return ok(res, await roleService.setUserRoles(id, roleIds), '用户角色已更新');
});

export const getMyRoles = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  return ok(res, await roleService.getUserRoles(id));
});

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) throw AppError.badRequest('请选择头像图片（字段名 file，jpg/png/gif/webp，≤2MB）');
  const stored = await storage.put(file.buffer, { mime: file.mimetype, ext: extensionOf(file) });
  return ok(res, await userService.updateAvatar(currentId(req), stored.url), '头像已更新');
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as UpdateUserInput;
  return ok(res, await userService.updateMe(currentId(req), body), '资料已更新');
});
