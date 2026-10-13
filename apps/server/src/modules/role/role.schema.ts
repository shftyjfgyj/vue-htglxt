import { z } from 'zod';
import { IdParamSchema } from '../user/user.schema.js';

export const RoleIdParamSchema = IdParamSchema;

export const CreateRoleSchema = z.object({
  code: z.string().trim().min(2, '角色编码至少 2 位').max(30).regex(/^[a-z][a-z0-9_]*$/, '角色编码需为小写字母、数字或下划线'),
  name: z.string().trim().min(1, '角色名称必填').max(50),
  description: z.string().trim().max(255).optional(),
  permissionIds: z.array(z.number().int().positive()).max(200).optional()
});

export const UpdateRoleSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  description: z.string().trim().max(255).optional()
});

export const SetPermissionsSchema = z.object({
  permissionIds: z.array(z.number().int().positive()).max(200)
});

export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
