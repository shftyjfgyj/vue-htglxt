
---

# 内容域接口（M3 已实现）

## 分类

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /categories | 分类列表（含文章数） | category:list |
| POST | /categories | 新建分类（别名唯一，冲突 409） | category:create |
| PUT | /categories/:id | 更新分类 | category:update |
| DELETE | /categories/:id | 删除分类（有文章时 400） | category:delete |

## 标签

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /tags | 标签列表（含被引用次数） | tag:list |
| GET | /tags/popular?limit=10 | 热门标签（按引用降序） | tag:list |
| POST | /tags | 新建标签 | tag:create |
| PUT | /tags/:id | 更新标签 | tag:update |
| DELETE | /tags/:id | 删除标签 | tag:delete |

## 文章与版本

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /articles | 列表：keyword/status/categoryId/tagId/authorId/onlyMine + 分页；无审核权限者仅见自己的 | article:list |
| POST | /articles | 新建（submit=true 直接提交审核） | article:create |
| GET | /articles/:id | 详情（含分类、标签、作者、版本数；访问即 +1 浏览） | article:detail 或 article:list |
| PUT | /articles/:id | 更新（旧内容自动存为历史版本） | article:update |
| DELETE | /articles/:id | 软删除 | article:delete |
| POST | /articles/:id/submit | 提交审核（草稿/驳回可提交） | article:update |
| POST | /articles/:id/audit | 审核：{approved, remark}，通过即发布 | article:audit |
| POST | /articles/:id/publish | 发布/下线：{publish} | article:publish |
| GET | /articles/:id/versions | 历史版本列表 | article:detail |
| GET | /articles/:id/versions/:versionId | 版本内容 | article:detail |
| GET | /articles/:id/versions/diff?from=&to= | 行级 diff | article:detail |
| POST | /articles/:id/versions/:versionId/restore | 恢复版本（当前内容存为新版本） | article:update |

## 评论与互动

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /comments | 评论列表（articleId/auditStatus/keyword + 分页） | comment:list |
| POST | /comments | 发表评论（仅已发布文章） | 登录 |
| PUT | /comments/:id/audit | 审核：{auditStatus: 0/1/2} | comment:audit |
| DELETE | /comments/:id | 软删除（联动计数） | comment:delete |
| POST/DELETE | /articles/:id/like | 点赞 / 取消（幂等） | 登录 |
| POST/DELETE | /users/:id/follow | 关注 / 取关（不能关注自己） | 登录 |
| GET | /users/:id/followers \| /following \| /mutual \| /follow-status | 粉丝 / 关注 / 互关 / 关注状态与计数 | 登录 |
| GET | /me/following \| /me/followers \| /me/mutual | 当前登录用户的关注数据（修正老系统 404） | 登录 |

## 上传与看板

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | /upload/image | multipart 字段 `file`；jpg/png/gif/webp，≤2MB；返回 {url,size,mime} | article:create 等任一内容权限 |
| GET | /uploads/... | 上传文件静态访问 | 公开 |
| GET | /dashboard/overview | 概览统计 | dashboard:view |
| GET | /dashboard/trend?days=7 | 发文趋势（按天补齐） | dashboard:view |
| GET | /dashboard/popular | 热门文章 Top10 | dashboard:view |
