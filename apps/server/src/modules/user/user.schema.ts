import { z } from 'zod';
import { PaginationSchema } from '../../common/pagination.js';

export const ListUserQuerySchema = PaginationSchema.extend({
  keyword: z.string().trim().max(50).optional(),
  status: z.coerce.number().int().min(0).max(1).optional()
});

export const IdParamSchema = z.object({
  id: z.coerce.number().int().positive()
});

export const CreateUserSchema = z.object({
  username: z.string().trim().min(3, '用户名至少 3 位').max(50),
  password: z.string().min(8, '密码至少 8 位').max(64).regex(/[A-Za-z]/, '密码需含字母').regex(/\d/, '密码需含数字'),
  nickname: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().email('邮箱格式不正确').max(100).optional().or(z.literal('')),
  status: z.number().int().min(0).max(1).optional(),
  // 角色必选：避免创建出零权限账号，也避免权限被无意放大
  roleIds: z.array(z.number().int().positive()).min(1, '请至少选择一个角色').max(10)
});

export const UpdateUserSchema = z.object({
  nickname: z.string().trim().min(1).max(50).optional(),
  email: z.string().trim().email('邮箱格式不正确').max(100).optional().or(z.literal('')),
  avatar: z.string().trim().max(255).optional()
});

export const SetStatusSchema = z.object({
  status: z.number().int().min(0).max(1)
});

export const ResetPasswordSchema = z.object({
  newPassword: z.string().min(8, '密码至少 8 位').max(64).regex(/[A-Za-z]/, '密码需含字母').regex(/\d/, '密码需含数字')
});

export const SetTrustSchema = z.object({
  autoAudit: z.boolean().optional(),
  resetViolations: z.boolean().optional()
});

export const SetUserRolesSchema = z.object({
  roleIds: z.array(z.number().int().positive()).max(10)
});

export type ListUserQuery = z.infer<typeof ListUserQuerySchema>;
export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
