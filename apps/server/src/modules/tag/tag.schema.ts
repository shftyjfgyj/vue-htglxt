import { z } from 'zod';

export const TagIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const PopularQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10) });

const color = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, '颜色需为 #RRGGBB 格式');

export const CreateTagSchema = z.object({
  name: z.string().trim().min(1, '标签名称必填').max(50),
  color: color.optional()
});

export const UpdateTagSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  color: color.optional()
});
