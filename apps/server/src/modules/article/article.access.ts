/**
 * 文章域的「可见范围」与「可否改写他人内容」是两个不同的概念。
 *
 * 历史上两者被同一个 `isContentManager` 混用（且仓库里有三份口径不一致的实现：
 * article.service 用 article:audit、article.bulk.service 用 article:audit、
 * moderation.service 用 article:manage + article:audit），
 * 结果是持有 `article:audit` 的审核人绕过了所有权校验，能直接编辑/删除别人的文章。
 *
 * 这里收敛为唯一一份判定，供 article.service / article.bulk.service 共用：
 *
 * - 看全站（列表放开作者过滤、可读他人文章、可看审核记录）：article:manage 或 article:audit
 * - 改他人（编辑/删除/提交审核/回滚版本/回收站恢复）：仅 article:manage，默认只给 admin
 */

/** 可查看全站文章：内容管理者不受「仅自己」的作者过滤限制 */
export function canViewAllContent(user: { permissions: string[] }): boolean {
  const p = user.permissions;
  return p.includes('*') || p.includes('article:manage') || p.includes('article:audit');
}

/**
 * 可改写 / 删除「他人」的文章：仅全站内容管理（article:manage）。
 * 审核人（article:audit）能看、能审、能发布，但不能替作者改稿、删稿、提交或回滚版本。
 */
export function canManageOthersContent(user: { permissions: string[] }): boolean {
  const p = user.permissions;
  return p.includes('*') || p.includes('article:manage');
}

/**
 * 某一篇文章当前用户能否编辑：本人且有 article:update，或持有 article:manage。
 *
 * 详情接口把这个结论随文章一起返回，前端就不必用本地缓存的权限去推断
 * 「这行能不能编辑」——权限快照过期时也不会显示错误的按钮。
 */
export function canEditOwnArticle(
  article: { userId: number },
  user: { id: number; permissions: string[] }
): boolean {
  const p = user.permissions;
  if (!p.includes('*') && !p.includes('article:update')) return false;
  return article.userId === user.id || canManageOthersContent(user);
}
