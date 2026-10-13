import { describe, expect, it } from 'vitest';
import { pageResult, parsePagination } from '../common/pagination.js';

describe('分页工具', () => {
  it('缺省值为第 1 页、每页 10 条', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 10, offset: 0 });
  });

  it('字符串参数会被转换并算出 offset', () => {
    expect(parsePagination({ page: '3', pageSize: '20' })).toEqual({ page: 3, pageSize: 20, offset: 40 });
  });

  it('超出上限的 pageSize 被拒绝', () => {
    expect(() => parsePagination({ pageSize: '500' })).toThrow();
  });

  it('pageResult 结构统一', () => {
    expect(pageResult([{ id: 1 }], 1, 1, 10)).toEqual({ list: [{ id: 1 }], total: 1, page: 1, pageSize: 10 });
  });
});
