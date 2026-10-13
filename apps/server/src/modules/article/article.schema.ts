import { z } from 'zod';
import { PaginationSchema } from '../../common/pagination.js';

export const ArticleIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * 查询串里的布尔值必须显式解析：
 * z.coerce.boolean() 会把字符串 'false' 变成 true（Boolean('false') === true），
 * 导致「只看我的」开关一旦出现在 URL 里就永远为真 —— E2E 发现的管理员列表 0 条根因。
 */
const QueryBoolean = (defaultValue?: boolean) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'boolean') return value;
    const text = String(value).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(text)) return true;
    if (['false', '0', 'no'].includes(text)) return false;
    return defaultValue;
  }, z.boolean().optional());

export const VersionParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  versionId: z.coerce.number().int().positive()
});

export const ListArticleQuerySchema = PaginationSchema.extend({
  keyword: z.string().trim().max(100).optional(),
  status: z.coerce.number().int().min(0).max(4).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  tagId: z.coerce.number().int().positive().optional(),
  authorId: z.coerce.number().int().positive().optional(),
  onlyMine: QueryBoolean(),
  fulltext: QueryBoolean(),
  /** 回收站视图 */
  trashed: QueryBoolean(),
  sortBy: z.enum(['updated', 'created', 'views', 'likes']).default('updated')
});

const tagIds = z.array(z.number().int().positive()).max(20);

export type ListArticleQuery = z.infer<typeof ListArticleQuerySchema>;

export const CreateArticleSchema = z.object({
  title: z.string().trim().min(2, '标题至少 2 个字').max(200),
  summary: z.string().trim().max(500).optional(),
  content: z.string().min(1, '正文不能为空').max(500000),
  coverImg: z.string().trim().max(255).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  tagIds: tagIds.optional(),
  submit: z.boolean().optional()
});

export const UpdateArticleSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  summary: z.string().trim().max(500).optional(),
  content: z.string().min(1).max(500000).optional(),
  coverImg: z.string().trim().max(255).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  tagIds: tagIds.optional()
});

export const AuditArticleSchema = z.object({
  approved: z.boolean(),
  remark: z.string().trim().max(255).optional()
});

/**
 * 质量体检预览：编辑器边写边算，所以字段全部可选且不做 min 校验
 * （标题只写了一个字也应该拿到分数与建议，而不是 422）。
 */
export const QualityPreviewSchema = z.object({
  title: z.string().max(200).optional(),
  summary: z.string().max(500).optional(),
  content: z.string().max(500000).optional(),
  coverImg: z.string().max(255).optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  tagIds: tagIds.optional()
});

export const PublishArticleSchema = z.object({ publish: z.boolean() });

export const BatchSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, '请至少选择一篇文章').max(200),
  action: z.enum(['delete', 'category', 'publish', 'offline', 'addTags', 'removeTags', 'submit']),
  categoryId: z.number().int().positive().nullable().optional(),
  tagIds: z.array(z.number().int().positive()).max(20).optional()
});

export const ExportQuerySchema = z.object({
  keyword: z.string().trim().max(100).optional(),
  status: z.coerce.number().int().min(0).max(4).optional(),
  categoryId: z.coerce.number().int().positive().optional()
});

export const DiffQuerySchema = z.object({
  from: z.coerce.number().int().positive(),
  to: z.coerce.number().int().positive()
});
