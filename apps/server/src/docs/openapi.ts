/** 手写 OpenAPI 3.0 描述，启动后可在 /docs 交互调试 */
const envelope = (schema: Record<string, unknown>, message = 'ok') => ({
  type: 'object',
  properties: {
    code: { type: 'integer', example: 0 },
    message: { type: 'string', example: message },
    data: schema,
    traceId: { type: 'string' }
  }
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: '后台管理系统 API',
    version: '1.0.0',
    description: 'Vue3 + Node + MySQL 重写工程 · M1 地基 + M2 认证与权限\n\n鉴权：先调 /auth/login，把返回的 accessToken 填入右上角 Authorize（Bearer）。'
  },
  servers: [{ url: 'http://localhost:3001', description: '本地开发' }],
  tags: [
    { name: '认证' }, { name: '用户' }, { name: '角色权限' }, { name: '日志' }, { name: '系统' },
    { name: '内容 · 分类' }, { name: '内容 · 标签' }, { name: '内容 · 文章' },
    { name: '内容 · 评论' }, { name: '内容 · 互动' }, { name: '内容 · 上传' }, { name: '内容 · 看板' }, { name: '通知' }
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    },
    schemas: {
      Page: {
        type: 'object',
        properties: {
          list: { type: 'array', items: { type: 'object' } },
          total: { type: 'integer' },
          page: { type: 'integer' },
          pageSize: { type: 'integer' }
        }
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: { tags: ['系统'], summary: '健康检查', security: [], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['认证'], summary: '登录', security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['username', 'password'],
                properties: { username: { type: 'string', example: 'admin' }, password: { type: 'string', example: 'Admin@123456' } }
              }
            }
          }
        },
        responses: {
          200: {
            description: '登录成功',
            content: {
              'application/json': {
                schema: envelope({
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    user: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer' }, username: { type: 'string' }, nickname: { type: 'string' },
                        roles: { type: 'array', items: { type: 'string' } },
                        permissions: { type: 'array', items: { type: 'string' } }
                      }
                    }
                  }
                })
              }
            }
          },
          400: { description: '用户名或密码错误' },
          429: { description: '登录过于频繁' }
        }
      }
    },
    '/api/v1/auth/refresh': {
      post: {
        tags: ['认证'], summary: '刷新令牌（旋转）', security: [],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
        responses: { 200: { description: '刷新成功' }, 401: { description: '刷新令牌失效' } }
      }
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['认证'], summary: '登出（吊销 refresh token）',
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { refreshToken: { type: 'string' } } } } } },
        responses: { 200: { description: '已退出' } }
      }
    },
    '/api/v1/auth/profile': {
      get: { tags: ['认证'], summary: '当前用户信息 + 角色 + 权限码', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/auth/password': {
      put: {
        tags: ['认证'], summary: '修改自己的密码',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['oldPassword', 'newPassword'], properties: { oldPassword: { type: 'string' }, newPassword: { type: 'string' } } } } } },
        responses: { 200: { description: '已修改（所有会话失效）' } }
      }
    },
    '/api/v1/users': {
      get: {
        tags: ['用户'], summary: '用户列表（需 user:list）',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'integer', enum: [0, 1] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10 } }
        ],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: envelope(ref('Page')) } } }, 403: { description: '缺少权限' } }
      },
      post: {
        tags: ['用户'], summary: '新建用户（需 user:create）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object', required: ['username', 'password', 'roleIds'],
                properties: {
                  username: { type: 'string' }, password: { type: 'string' }, nickname: { type: 'string' },
                  email: { type: 'string' }, status: { type: 'integer', enum: [0, 1] },
                  roleIds: { type: 'array', minItems: 1, items: { type: 'integer' }, description: '角色必选，至少一个' }
                }
              }
            }
          }
        },
        responses: { 201: { description: '创建成功' }, 409: { description: '用户名已存在' } }
      }
    },
    '/api/v1/users/me': {
      put: { tags: ['用户'], summary: '修改自己的资料', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/users/{id}': {
      get: { tags: ['用户'], summary: '用户详情', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      put: { tags: ['用户'], summary: '更新用户（需 user:update）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      delete: { tags: ['用户'], summary: '软删除用户（需 user:delete）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/users/{id}/status': {
      put: {
        tags: ['用户'], summary: '启用/停用（需 user:status，停用会强制下线）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['status'], properties: { status: { type: 'integer', enum: [0, 1] } } } } } },
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/users/{id}/password': {
      put: {
        tags: ['用户'], summary: '重置密码（需 user:resetPwd）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['newPassword'], properties: { newPassword: { type: 'string' } } } } } },
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/users/{id}/roles': {
      get: { tags: ['用户'], summary: '用户角色', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      put: {
        tags: ['用户'], summary: '覆写用户角色（需 role:assignUser）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['roleIds'], properties: { roleIds: { type: 'array', items: { type: 'integer' } } } } } } },
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/roles': {
      get: { tags: ['角色权限'], summary: '角色列表（需 role:list）', responses: { 200: { description: 'OK' } } },
      post: {
        tags: ['角色权限'], summary: '新建角色（需 role:create）',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['code', 'name'], properties: { code: { type: 'string', example: 'operator' }, name: { type: 'string' }, description: { type: 'string' }, permissionIds: { type: 'array', items: { type: 'integer' } } } } } } },
        responses: { 201: { description: '创建成功' } }
      }
    },
    '/api/v1/roles/permissions/all': {
      get: { tags: ['角色权限'], summary: '全部权限点（按模块分组）', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/roles/{id}': {
      get: { tags: ['角色权限'], summary: '角色详情', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      put: { tags: ['角色权限'], summary: '更新角色（需 role:update）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      delete: { tags: ['角色权限'], summary: '删除角色（系统角色禁止）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/roles/{id}/permissions': {
      get: { tags: ['角色权限'], summary: '角色权限 id 列表', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      put: {
        tags: ['角色权限'], summary: '覆写角色权限（需 role:assignPerm；admin 角色禁止改）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['permissionIds'], properties: { permissionIds: { type: 'array', items: { type: 'integer' } } } } } } },
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/menus': {
      get: { tags: ['角色权限'], summary: '当前用户可见菜单（按权限过滤成树）', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/logs/operation': {
      get: {
        tags: ['日志'], summary: '操作日志（需 log:operation）',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
          { name: 'module', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10 } }
        ],
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/logs/login': {
      get: {
        tags: ['日志'], summary: '登录日志（需 log:login）',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
          { name: 'success', in: 'query', schema: { type: 'integer', enum: [0, 1] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10 } }
        ],
        responses: { 200: { description: 'OK' } }
      }
    }
    ,
    // ---------------- M3 内容域 ----------------
    '/api/v1/categories': {
      get: { tags: ['内容 · 分类'], summary: '分类列表（含文章数，需 category:list）', responses: { 200: { description: 'OK' } } },
      post: { tags: ['内容 · 分类'], summary: '新建分类（需 category:create）', responses: { 201: { description: '创建成功' }, 409: { description: '别名重复' } } }
    },
    '/api/v1/categories/{id}': {
      put: { tags: ['内容 · 分类'], summary: '更新分类（需 category:update）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      delete: { tags: ['内容 · 分类'], summary: '删除分类（有文章时 400）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 400: { description: '分类下仍有文章' } } }
    },
    '/api/v1/tags': {
      get: { tags: ['内容 · 标签'], summary: '标签列表（需 tag:list）', responses: { 200: { description: 'OK' } } },
      post: { tags: ['内容 · 标签'], summary: '新建标签（需 tag:create）', responses: { 201: { description: '创建成功' } } }
    },
    '/api/v1/tags/popular': {
      get: { tags: ['内容 · 标签'], summary: '热门标签（按引用次数降序）', parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/tags/{id}': {
      put: { tags: ['内容 · 标签'], summary: '更新标签（需 tag:update）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      delete: { tags: ['内容 · 标签'], summary: '删除标签（需 tag:delete）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/articles': {
      get: {
        tags: ['内容 · 文章'], summary: '文章列表（需 article:list；无 article:audit 者仅见自己的）',
        parameters: [
          { name: 'keyword', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'integer', enum: [0, 1, 2, 3, 4] } },
          { name: 'categoryId', in: 'query', schema: { type: 'integer' } },
          { name: 'tagId', in: 'query', schema: { type: 'integer' } },
          { name: 'onlyMine', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10 } }
        ],
        responses: { 200: { description: 'OK', content: { 'application/json': { schema: envelope(ref('Page')) } } } }
      },
      post: {
        tags: ['内容 · 文章'], summary: '新建文章（需 article:create；submit=true 直接提交审核）',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['title', 'content'], properties: { title: { type: 'string' }, summary: { type: 'string' }, content: { type: 'string' }, coverImg: { type: 'string' }, categoryId: { type: 'integer', nullable: true }, tagIds: { type: 'array', items: { type: 'integer' } }, submit: { type: 'boolean' } } } } } },
        responses: { 201: { description: '创建成功' } }
      }
    },
    '/api/v1/articles/{id}': {
      get: { tags: ['内容 · 文章'], summary: '文章详情（浏览 +1）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } },
      put: { tags: ['内容 · 文章'], summary: '更新文章（旧内容自动存为历史版本，需 article:update）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' }, 400: { description: '待审核状态不可编辑' } } },
      delete: { tags: ['内容 · 文章'], summary: '软删除文章（需 article:delete）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/articles/{id}/submit': {
      post: { tags: ['内容 · 文章'], summary: '提交审核（草稿/驳回 → 待审核）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/articles/{id}/audit': {
      post: {
        tags: ['内容 · 文章'], summary: '审核文章（需 article:audit；通过即发布）',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['approved'], properties: { approved: { type: 'boolean' }, remark: { type: 'string' } } } } } },
        responses: { 200: { description: 'OK' }, 400: { description: '非待审核状态' } }
      }
    },
    '/api/v1/articles/{id}/publish': {
      post: { tags: ['内容 · 文章'], summary: '发布 / 下线（需 article:publish）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/articles/{id}/versions': {
      get: { tags: ['内容 · 文章'], summary: '历史版本列表', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/articles/{id}/versions/diff': {
      get: {
        tags: ['内容 · 文章'], summary: '两个版本的行级 diff',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'from', in: 'query', required: true, schema: { type: 'integer' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/articles/{id}/versions/{versionId}/restore': {
      post: {
        tags: ['内容 · 文章'], summary: '恢复历史版本（当前内容存为新版本，文章回落草稿）',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'integer' } },
          { name: 'versionId', in: 'path', required: true, schema: { type: 'integer' } }
        ],
        responses: { 200: { description: 'OK' } }
      }
    },
    '/api/v1/comments': {
      get: { tags: ['内容 · 评论'], summary: '评论列表（需 comment:list）', parameters: [{ name: 'auditStatus', in: 'query', schema: { type: 'integer', enum: [0, 1, 2] } }, { name: 'articleId', in: 'query', schema: { type: 'integer' } }, { name: 'keyword', in: 'query', schema: { type: 'string' } }, { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 10 } }], responses: { 200: { description: 'OK' } } },
      post: { tags: ['内容 · 评论'], summary: '发表评论（仅已发布文章，登录即可）', responses: { 201: { description: '创建成功' }, 400: { description: '文章未发布' } } }
    },
    '/api/v1/comments/{id}/audit': {
      put: { tags: ['内容 · 评论'], summary: '评论审核（需 comment:audit）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/comments/{id}': {
      delete: { tags: ['内容 · 评论'], summary: '删除评论（需 comment:delete，联动计数）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/articles/{id}/like': {
      post: { tags: ['内容 · 互动'], summary: '点赞（幂等）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 201: { description: 'OK' } } },
      delete: { tags: ['内容 · 互动'], summary: '取消点赞', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/users/{id}/follow': {
      post: { tags: ['内容 · 互动'], summary: '关注用户（不能关注自己）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 201: { description: 'OK' }, 400: { description: '不能关注自己' } } },
      delete: { tags: ['内容 · 互动'], summary: '取消关注', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/users/{id}/follow-status': {
      get: { tags: ['内容 · 互动'], summary: '关注状态与计数', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/me/following': {
      get: { tags: ['内容 · 互动'], summary: '我关注的人（修正老系统 /users/me/* 404）', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/me/followers': {
      get: { tags: ['内容 · 互动'], summary: '我的粉丝', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/me/mutual': {
      get: { tags: ['内容 · 互动'], summary: '互关列表', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/upload/image': {
      post: {
        tags: ['内容 · 上传'], summary: '图片上传（jpg/png/gif/webp，≤2MB，字段名 file）',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
        responses: { 201: { description: '返回 {url,size,mime}' }, 400: { description: '类型或大小不合规' } }
      }
    },
    '/api/v1/dashboard/overview': {
      get: { tags: ['内容 · 看板'], summary: '概览统计（需 dashboard:view）', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/dashboard/trend': {
      get: { tags: ['内容 · 看板'], summary: '发文趋势', parameters: [{ name: 'days', in: 'query', schema: { type: 'integer', default: 7 } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/dashboard/popular': {
      get: { tags: ['内容 · 看板'], summary: '热门文章 Top10', responses: { 200: { description: 'OK' } } }
    }
    ,
    '/api/v1/articles/batch': {
      post: {
        tags: ['内容 · 文章'], summary: '批量操作（删除/改分类/发布/下线/打标签/提交审核）',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['ids', 'action'], properties: { ids: { type: 'array', items: { type: 'integer' } }, action: { type: 'string', enum: ['delete', 'category', 'publish', 'offline', 'addTags', 'removeTags', 'submit'] }, categoryId: { type: 'integer', nullable: true }, tagIds: { type: 'array', items: { type: 'integer' } } } } } } },
        responses: { 200: { description: '返回 {requested, affected, skipped, errors[]}' } }
      }
    },
    '/api/v1/articles/export': {
      get: { tags: ['内容 · 文章'], summary: '导出 xlsx（≤5000 条）', parameters: [{ name: 'keyword', in: 'query', schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'integer' } }, { name: 'categoryId', in: 'query', schema: { type: 'integer' } }], responses: { 200: { description: 'xlsx 文件流' } } }
    },
    '/api/v1/articles/import/template': {
      get: { tags: ['内容 · 文章'], summary: '下载导入模板 xlsx', responses: { 200: { description: 'xlsx 文件流' } } }
    },
    '/api/v1/articles/import': {
      post: { tags: ['内容 · 文章'], summary: '导入 xlsx/csv（字段 file，≤5MB）', requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } }, responses: { 200: { description: '返回 {total, created, skipped, errors[]}' }, 400: { description: '文件类型或表头不合规' } } }
    },
    '/api/v1/articles/{id}/comments': {
      get: { tags: ['内容 · 评论'], summary: '评论树（楼中楼）', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/notifications': {
      get: { tags: ['通知'], summary: '我的通知（isRead/page/pageSize）', parameters: [{ name: 'isRead', in: 'query', schema: { type: 'integer', enum: [0, 1] } }, { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } }], responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/notifications/unread-count': {
      get: { tags: ['通知'], summary: '未读数', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/notifications/read': {
      put: { tags: ['通知'], summary: '标记已读 {ids:[]}', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/notifications/read-all': {
      put: { tags: ['通知'], summary: '全部标记已读', responses: { 200: { description: 'OK' } } }
    },
    '/api/v1/notifications/{id}': {
      delete: { tags: ['通知'], summary: '删除通知', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'OK' } } }
    }
  }
} as const;
