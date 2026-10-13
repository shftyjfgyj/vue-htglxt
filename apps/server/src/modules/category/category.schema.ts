import { z } from 'zod';

export const CategoryIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const CreateCategorySchema = z.object({
  name: z.string().trim().min(1, '分类名称必填').max(50),
  alias: z.string().trim().min(1, '别名必填').max(50).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, '别名以字母开头，仅含字母/数字/下划线/连字符'),
  sort: z.number().int().min(0).max(9999).optional()
});

export const UpdateCategorySchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  alias: z.string().trim().min(1).max(50).regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/).optional(),
  sort: z.number().int().min(0).max(9999).optional()
});
