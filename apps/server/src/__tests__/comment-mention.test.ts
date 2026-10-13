import { describe, expect, it } from 'vitest';
import { extractMentions } from '../modules/comment/comment.service.js';

describe('extractMentions @提及解析', () => {
  it('解析中文昵称', () => {
    expect(extractMentions('你好 @张三 帮忙看看')).toEqual(['张三']);
  });

  it('多个提及按出现顺序返回', () => {
    expect(extractMentions('@李四 @王五 一起看')).toEqual(['李四', '王五']);
  });

  it('重复提及只保留一个', () => {
    expect(extractMentions('@张三 @张三 @李四')).toEqual(['张三', '李四']);
  });

  it('句中标点会截断昵称', () => {
    expect(extractMentions('@张三，这个方案可以')).toEqual(['张三']);
    expect(extractMentions('@张三。')).toEqual(['张三']);
  });

  it('邮箱里的 @ 不算提及', () => {
    expect(extractMentions('有问题发我邮箱 bob@example.com')).toEqual([]);
  });

  it('没有提及返回空数组', () => {
    expect(extractMentions('就是一条普通评论')).toEqual([]);
    expect(extractMentions('')).toEqual([]);
  });

  it('最多只取 5 个，避免刷通知', () => {
    expect(extractMentions('@a @b @c @d @e @f @g')).toHaveLength(5);
  });
});
