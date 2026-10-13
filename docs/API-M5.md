
---

# M5 接口（已实现）

## 评论树

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /articles/:id/comments | 审核通过的评论树（楼中楼，children 递归） | 登录 |
| POST | /comments | 发表评论 / 回复：{articleId, content, parentId?}；父评论必须属于同一篇文章 | 登录 |

## 通知中心

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /notifications?isRead=&page=&pageSize= | 我的通知（按用户隔离） |
| GET | /notifications/unread-count | 未读数 |
| PUT | /notifications/read | 标记已读：{ids:[]} |
| PUT | /notifications/read-all | 全部已读 |
| DELETE | /notifications/:id | 删除通知 |

通知类型：`audit`（审核结果）、`comment`（文章被评论）、`reply`（评论被回复）、`follow`（被关注）、`like`/`system`（预留）。

## 批量操作与导入导出

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | /articles/batch | {ids, action, categoryId?, tagIds?}；action ∈ delete/category/publish/offline/addTags/removeTags/submit；返回 affected/skipped/errors | article:update 等 |
| GET | /articles/export?keyword=&status=&categoryId= | 导出 xlsx（≤5000 条），响应为文件流 | article:list |
| GET | /articles/import/template | 下载导入模板 xlsx | article:create |
| POST | /articles/import | 上传 xlsx/csv（字段 file，≤5MB）导入文章，返回 {total, created, skipped, errors[]} | article:create |

## 全文检索参数

`GET /articles?keyword=关键词&fulltext=true` —— 使用 ngram 全文索引（BOOLEAN MODE，自动前缀通配）；不传 `fulltext` 时走 LIKE，且 LIKE 同时匹配标题/摘要/正文。
