import { describe, expect, it } from 'vitest';
import { canEditOwnArticle, canManageOthersContent, canViewAllContent } from '../modules/article/article.access.js';

/**
 * 回归防护：editor（持有 article:audit）曾经能直接编辑/删除别人的文章，
 * 因为所有权校验用的判定把 article:audit 当成了「可改写他人内容」。
 * 这两个判定的边界一旦被改回去，这里必须失败。
 */

const ADMIN = ['*'];
const EDITOR = [
  'article:list',
  'article:detail',
  'article:create',
  'article:update',
  'article:delete',
  'article:publish',
  'article:audit'
];
/**
 * 权限模型是「动作 + 范围」两层：
 *   - 动作权限 article:update / article:delete —— 能不能做这个动作（路由 requirePermission 把门）
 *   - 范围权限 article:manage —— 能不能作用于「别人的」文章（服务层所有权校验把门）
 * 所以「能改他人文章」= article:update + article:manage。
 */
const MANAGER = ['article:list', 'article:detail', 'article:update', 'article:delete', 'article:manage'];
const VIEWER = ['article:list', 'article:detail'];

const user = (permissions: string[]) => ({ permissions });

describe('文章可见范围（canViewAllContent）', () => {
  it('管理员 / 全站管理 / 审核人都能看到全站文章', () => {
    expect(canViewAllContent(user(ADMIN))).toBe(true);
    expect(canViewAllContent(user(MANAGER))).toBe(true);
    expect(canViewAllContent(user(EDITOR))).toBe(true);
  });

  it('普通作者与只读访客只能看到自己的', () => {
    expect(canViewAllContent(user(VIEWER))).toBe(false);
    expect(canViewAllContent(user([]))).toBe(false);
  });
});

describe('改写他人文章（canManageOthersContent）', () => {
  it('editor 持有 article:audit 也不再能改写他人文章（本 bug 的核心）', () => {
    expect(canManageOthersContent(user(EDITOR))).toBe(false);
  });

  it('只有 article:manage 或通配权限才能改写他人文章', () => {
    expect(canManageOthersContent(user(MANAGER))).toBe(true);
    expect(canManageOthersContent(user(ADMIN))).toBe(true);
  });

  it('只读访客与空权限一律拒绝', () => {
    expect(canManageOthersContent(user(VIEWER))).toBe(false);
    expect(canManageOthersContent(user([]))).toBe(false);
  });

  it('可改写他人的角色必然也能看到全站（避免出现「改得到却看不到」）', () => {
    for (const permissions of [ADMIN, MANAGER]) {
      expect(canManageOthersContent(user(permissions))).toBe(true);
      expect(canViewAllContent(user(permissions))).toBe(true);
    }
  });
});

describe('单篇文章能否编辑（canEditOwnArticle）——详情接口下发给前端', () => {
  const ME = 2;
  const OTHER = 1;
  const asUser = (permissions: string[], id = ME) => ({ id, permissions });

  it('自己的文章可编辑', () => {
    expect(canEditOwnArticle({ userId: ME }, asUser(EDITOR))).toBe(true);
  });

  it('editor 不能编辑他人的文章（本 bug 的核心）', () => {
    expect(canEditOwnArticle({ userId: OTHER }, asUser(EDITOR))).toBe(false);
  });

  it('持有 article:manage 可以编辑他人的文章', () => {
    expect(canEditOwnArticle({ userId: OTHER }, asUser(MANAGER))).toBe(true);
    expect(canEditOwnArticle({ userId: OTHER }, asUser(ADMIN))).toBe(true);
  });

  it('没有 article:update 时连自己的文章也不能编辑', () => {
    expect(canEditOwnArticle({ userId: ME }, asUser(VIEWER))).toBe(false);
  });

  it('article:manage 是「范围」权限，单独持有不足以编辑他人文章（仍需 article:update）', () => {
    expect(canEditOwnArticle({ userId: OTHER }, asUser(['article:manage']))).toBe(false);
    // 有了动作权限才成立
    expect(canEditOwnArticle({ userId: OTHER }, asUser(['article:update', 'article:manage']))).toBe(true);
  });
});
