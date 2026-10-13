import { describe, expect, it } from 'vitest';
import { computeStreaks } from '../modules/growth/growth.service.js';

/** 与 service 同一套本地日期口径 */
function daysAgo(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
}

describe('computeStreaks 连续创作天数', () => {
  it('没有任何记录时都是 0', () => {
    expect(computeStreaks([])).toEqual({ current: 0, longest: 0 });
  });

  it('只有今天算 1 天', () => {
    expect(computeStreaks([daysAgo(0)])).toEqual({ current: 1, longest: 1 });
  });

  it('今天起往前连续三天 → current 与 longest 都是 3', () => {
    expect(computeStreaks([daysAgo(0), daysAgo(1), daysAgo(2)])).toEqual({ current: 3, longest: 3 });
  });

  it('今天还没写但昨天写了，连胜仍然延续（当天未结束不算断）', () => {
    expect(computeStreaks([daysAgo(1), daysAgo(2)])).toEqual({ current: 2, longest: 2 });
  });

  it('今天与昨天都没写则当前连胜归零，但保留历史最长', () => {
    expect(computeStreaks([daysAgo(2), daysAgo(3)])).toEqual({ current: 0, longest: 2 });
  });

  it('历史最长可以大于当前连胜', () => {
    expect(computeStreaks([daysAgo(0), daysAgo(5), daysAgo(6), daysAgo(7)]))
      .toEqual({ current: 1, longest: 3 });
  });

  it('重复日期只算一天，乱序输入也能正确计算', () => {
    expect(computeStreaks([daysAgo(0), daysAgo(0), daysAgo(2), daysAgo(1)]))
      .toEqual({ current: 3, longest: 3 });
  });
});
