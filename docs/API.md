# 接口协议（v1）

统一前缀 `/api/v1`，统一响应结构：

```json
{ "code": 0, "message": "ok", "data": {}, "traceId": "b7c1..." }
```

- `code = 0` 表示成功，非 0 为业务错误码（同时返回合适的 HTTP 状态码）。
- 分页数据统一为 `{ "list": [], "total": 0, "page": 1, "pageSize": 10 }`。
- 鉴权：`Authorization: Bearer <accessToken>`；access token 15 分钟，refresh token 7 天。

## 认证

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| POST | /auth/login | 登录，返回 accessToken/refreshToken/user | 公开 |
| POST | /auth/refresh | 刷新令牌（旋转 refresh token） | 公开（凭 refreshToken） |
| POST | /auth/logout | 登出，吊销 refresh token | 登录 |
| GET | /auth/profile | 当前用户信息 + 角色 + 权限码 | 登录 |

## 用户

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /users | 用户列表（关键词/状态/分页） | user:list |
| POST | /users | 新建用户 | user:create |
| GET | /users/:id | 用户详情 | user:detail |
| PUT | /users/:id | 更新用户资料 | user:update |
| PUT | /users/:id/status | 启用/禁用 | user:status |
| PUT | /users/:id/password | 重置密码 | user:resetPwd |
| DELETE | /users/:id | 软删除用户 | user:delete |
| PUT | /users/me | 修改自己的资料 | 登录 |
| POST | /users/me/avatar | 上传头像（multipart，字段 file；更新后自动清理旧文件） | 登录 |
| PUT | /users/me/password | 修改自己的密码 | 登录 |

## 角色与权限

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /roles | 角色列表 | role:list |
| POST | /roles | 新建角色 | role:create |
| PUT | /roles/:id | 更新角色 | role:update |
| DELETE | /roles/:id | 删除角色（系统内置角色禁止） | role:delete |
| GET | /roles/:id/permissions | 角色权限 id 列表 | role:detail |
| PUT | /roles/:id/permissions | 覆写角色权限 | role:assignPerm |
| PUT | /users/:id/roles | 覆写用户角色 | role:assignUser |
| GET | /permissions | 全部权限（按模块分组） | role:list |
| GET | /menus | 当前用户可见菜单（按权限过滤） | 登录 |

## 日志

| 方法 | 路径 | 说明 | 权限 |
| --- | --- | --- | --- |
| GET | /logs/operation | 操作日志 | log:operation |
| GET | /logs/login | 登录日志 | log:login |

## 系统

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | /health | 健康检查（不需要鉴权） |
| GET | /docs | Swagger UI |

完整可交互文档启动后端后访问 **http://localhost:3001/docs**。
