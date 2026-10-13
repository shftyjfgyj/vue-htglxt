import { z } from 'zod';

/** 统一分页返回结构 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10)
});

export type Pagination = z.infer<typeof PaginationSchema> & { offset: number };

export function parsePagination(query: unknown): Pagination {
  const { page, pageSize } = PaginationSchema.parse(query ?? {});
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageResult<T>(list: T[], total: number, page: number, pageSize: number): PageResult<T> {
  return { list, total, page, pageSize };
}
