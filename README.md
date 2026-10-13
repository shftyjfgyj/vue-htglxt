# vue-htglxt — 后台管理系统（Vue3 + Node + MySQL 重写工程）

在老系统（`../vue-htglxt-client` + `../vue-htglxt-server`）的扫描分析基础上，按「契约优先、分层清楚、默认安全」重写的工程。
老系统的问题清单与总体方案见根目录 `后台管理系统-扫描分析与重构方案.md`。

## 交付范围：M1 ~ M6 全部完成（均已跑通验证）

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M1 地基 | TypeScript 全栈、分层骨架、统一响应/异常、zod 环境与参数校验、pino 日志、Swagger、Docker Compose、迁移脚本 | 已交付 |
| M2 认证与权限 | JWT 双令牌 + 旋转、RBAC（角色/权限/菜单）、用户与角色管理、审计日志、登录限流 | 已交付 |
| M3 内容域 | 分类 / 标签 / 文章（审核工作流 + 版本快照 + 行级 diff + 恢复）/ 评论 / 点赞关注 / 图片上传 / 数据看板 | 已交付 |
| M4 个人中心 | 头像上传（含旧文件清理）、个人资料、关注管理（关注/粉丝/互关、回关/取关） | 已交付 |
| M5 运营能力 | 评论楼中楼（含阅读页）、通知中心、文章批量操作、Excel 导入导出（含模板）、MySQL ngram 全文检索 | 已交付 |
| M8 互动增强 | 文章收藏、我的收藏/点赞内容库、评论跳转定位、阅读进度/目录/相关文章/复制链接/阅读时长 | 已交付 |
| M9 阅读与订阅 | 阅读历史（最近在看）、关注动态订阅、收藏分组与按分组筛选 | 已交付 |
| M10 创作中心 | 我的文章（数据概览、状态分栏、排序、批量操作）、复制为新草稿、回收站与恢复 | 已交付 |
| M11 自动审核 | 权限收敛（全站文章可见=article:audit）、违禁词库与命中测试、自动审核引擎（驳回/转人工/自动发布）、信任等级与违规冷却、评论复用、审核记录 | 已交付 |
| M12 评论权限与审核记录 | 全站评论仅管理员（comment:manage）、我的评论页、本人可删自己评论、审核记录时间线、列表机器判定列、审核队列提示条 | 已交付 |
| M13 文章越权修复 | 拆分「可见范围」与「改写他人文章」判定（后者=article:manage，仅 admin）、批量与编辑页同步收敛、新建用户角色必选 | 已交付 |
| M14 趣味性增强 | 创作热力图与连续天数、成就徽章墙（11 枚）、评论点赞与神评、@提及通知、文章质量体检分（7 维度） | 已交付 |
| M15 运营分析 | 独立页 `/analytics`：审核效能（自动化率/决策分布/审核员处理量/趋势）、标签共现图谱、兴趣画像、作者排行榜 | 已交付 |
| M6 上线能力 | Docker/PM2 部署产物、nginx 配置、数据库备份、Prometheus 指标与告警、Playwright 浏览器级 E2E | 已交付 |

## 目录结构

```
vue-htglxt/
├── apps/
│   ├── server/    # Express + TypeScript + MySQL：config / common / middleware / db / modules / docs
│   └── web/       # Vue3 + TypeScript + Vite + Element Plus(按需) + Pinia
├── docs/          # API 协议、数据库设计、部署手册、监控告警、各里程碑交付说明
├── docker/        # docker-compose（mysql + redis + api）
├── scripts/       # smoke-test.ps1 端到端冒烟测试
└── 后台管理系统-扫描分析与重构方案.md
```

## UI 设计

采用 Indigo 品牌色 + Slate 中性色 + 大圆角柔和阴影的现代风格，设计令牌集中在 `apps/web/src/styles/theme.scss`（覆盖 Element Plus 变量，改一处全局生效）。
写文章页采用「吸顶操作条 + 文档式稿纸 + 右侧发布设置」的编辑器布局。支持**深色模式**（顶栏一键切换、跟随系统、刷新保持、首屏无闪烁）、**表格列宽拖拽记忆**（`useTableColumns`）、**列表筛选条件记忆**（`useQueryMemory`，sessionStorage）、**移动端抽屉式侧栏**（≤900px）与**ECharts 多维趋势**（按需异步加载，可导出 **PDF 数据报表**）。
改版前后对比截图见 `ui-shots/`，设计规范与二次定制指南见 `docs/UI设计说明.md`。

## 部署

### 免费方案（无需信用卡，适合演示与个人项目）

手册：**docs/部署-免费方案A.md** —— Cloudflare Pages（前端）+ Render Free（后端）+ Aiven MySQL Free（数据库）+ Cloudflare R2（图片存储）。

配套工件：

| 文件 | 说明 |
| --- | --- |
| render.yaml | Render Blueprint：Docker 部署后端，环境变量清单（`sync: false` 的需在控制台填） |
| apps/web/public/_redirects | Cloudflare Pages / Netlify 的 SPA 回退，缺了深层地址会 404 |
| .github/workflows/keep-alive.yml | 可选保活，缓解 Render 免费实例休眠（750 小时/月刚好够一个服务常开） |
| apps/server/src/modules/upload/storage.ts | 上传存储驱动：`local`（本地磁盘）或 `s3`（R2 等） |

> 两个容易踩的坑，项目里已经处理好：**Aiven 强制 SSL**（配 `DB_SSL=require`）、
> **`apps/server/uploads/` 被 gitignore**（线上必须 `STORAGE_DRIVER=s3`，否则重新部署后图片全丢）。

### 自建服务器（阿里云 ECS + RDS + 域名 HTTPS）

生产部署手册：**docs/部署-阿里云ECS与RDS.md**（从购买、备案、安全组、RDS 配置到 HTTPS 与验收清单）。
采购与省钱指南：**docs/阿里云采购指南.md**（2026-10 核实的活动价、优惠入口、备案服务码要求、证书续期方案）。

配套工件：

| 文件 | 说明 |
| --- | --- |
| docker/docker-compose.prod.yml | 生产编排（api + web，MySQL 用 RDS；含 migrate 作业与可选 certbot） |
| docker/.env.production.example | 生产环境变量模板 |
| deploy/nginx/htglxt.prod.conf 与 .http-only.conf | HTTPS 版 / 首次上线 HTTP-only 版 Nginx |
| deploy/linux/{deploy,upgrade,healthcheck,backup,renew-cert}.sh | 一键部署、升级、自检、备份、证书 |

> 生产迁移用 SEED_DEMO=false：只建表 + 基础权限/角色/菜单 + 1 个管理员账号，不灌演示数据（099_*.sql 会被跳过）。

## 已在本机部署（可直接访问）

| 项 | 值 |
| --- | --- |
| 访问地址 | http://127.0.0.1:8080 （局域网 http://<局域网IP>:8080） |
| 演示账号 | admin / Admin@123456（**登录后请立即改密码**） |
| 启动 / 停止 / 状态 | `deploy\windows\start-htglxt.ps1` / `stop-htglxt.ps1` / `status-htglxt.ps1` |
| 部署验收 | `node deploy/windows/verify-deploy.mjs`（20 项，全部经 nginx） |
| 部署细节与待办 | `docs/部署记录-本机.md` |

## 快速开始

```bash
# 1) 安装依赖（前后端各自独立安装）
npm run setup

# 2) 后端环境变量
cp apps/server/.env.example apps/server/.env   # 按需修改数据库账号密码

# 3) 建库建表 + 权限/角色/菜单种子 + 演示账号（可重复执行；--fresh 会先删库）
npm run db:migrate

# 4) 启动后端：http://localhost:3001 ，接口文档 /docs
npm run dev:server

# 5) 启动前端：http://localhost:5173（已配置 /api 代理到 3001）
npm run dev:web
```

演示账号（密码可在 `.env` 的 `SEED_ADMIN_PASSWORD` 调整）：

| 账号 | 密码 | 角色 | 权限范围 |
| --- | --- | --- | --- |
| admin | Admin@123456 | 超级管理员 | `*` 全部权限 |
| editor | Editor@123456 | 内容编辑 | 文章/分类/标签/评论/看板，**无用户与角色管理**；可看全站文章并审核，但**不能改写/删除他人文章**（该能力需 `article:manage`，仅 admin） |
| viewer | Viewer@123456 | 只读访客 | 仅查看类权限 |
| suwan / zhouye / linxiaoman | Demo@123456 | 内容编辑 | 演示作者（苏晚 / 周野 / 林小满），由 `npm run seed:content` 创建 |

> 演示内容：`npm run seed:content` 会写入 42 篇真实文章（旅游/生活/情感/美食/阅读/职场 各 7 篇）、
> 6 个分类、35 个标签、约 100 条评论与互动记录，并生成审核记录与历史版本，
> 使看板、运营分析、热力图、成就徽章都有真实数据可看。
> 内容源文件在 `apps/server/scripts/seed-data/*.json`，可用 `node scripts/validate-seed-data.mjs` 校验。
>
> 分类封面由 `apps/server/scripts/make-covers.py`（Pillow）程序化生成到 **`apps/web/public/seed/`**，
> 每类 3 个变体轮换；**这是设计过的抽象封面，不是摄影作品**。
> 放在前端静态目录是刻意的：`apps/server/uploads/` 被 gitignore，放后端的话部署后根本不存在。
> 重跑 `python scripts/make-covers.py` 即可重新生成（种子固定，结果一致），再跑 `npm run seed:content` 回填。

## 已验证结果（本机 MySQL 5.7.36 实测）

| 验证项 | 命令 | 结果 |
| --- | --- | --- |
| 后端类型检查 | `npm --prefix apps/server run typecheck` | 通过（0 error） |
| 后端单元测试 | `npm --prefix apps/server test` | 4 个文件 14 个用例全部通过 |
| 数据库迁移 | `npm run db:migrate` | 建表 + 种子成功（htglxt_v2） |
| M2 接口冒烟 | `powershell -File scripts/smoke-test.ps1` | **24 项全部通过** |
| M3 接口冒烟 | `node scripts/smoke-m3.mjs` | **44 项全部通过**（分类/标签/文章/审核/版本 diff/评论/点赞/上传/看板） |
| M4 接口冒烟 | `node scripts/smoke-m4.mjs` | **19 项全部通过**（头像上传/旧文件清理/校验、关注/粉丝/互关、菜单与审计） |
| M5 接口冒烟 | `node scripts/smoke-m5.mjs` | **33 项全部通过**（楼中楼/通知/批量/Excel 导入导出/中文全文检索） |
| 前端类型检查 | `npm --prefix apps/web run typecheck` | 通过（vue-tsc，0 error） |
| 前端生产构建 | `npm --prefix apps/web run build` | 成功；主包 gzip 97.59 kB（全量引入时 372.7 kB），富文本编辑页按路由懒加载 |
| 累计断言 | 四个冒烟套件 | **120 项全部通过**（M2 24 + M3 44 + M4 19 + M5 33） |
| 浏览器级 E2E | `npm --prefix apps/web run test:e2e` | **36 个用例全部通过**（Playwright + Edge：登录/权限/文章全链路/系统管理 + 深色模式/列宽记忆/PDF 导出/ECharts/筛选记忆/移动端抽屉 + 收藏与评论定位） |
| 数据库备份 | `powershell -File scripts/backup-db.ps1` | 成功生成 173.6 KB dump |
| 监控指标 | `GET /metrics` | 暴露请求量/错误数/耗时直方图/业务事件/进程内存等 |

冒烟测试覆盖：健康检查、登录/令牌、未登录 401、**editor/viewer 越权 403（含新建用户、分配 admin 角色）**、
菜单按权限过滤、操作/登录审计日志、刷新令牌旋转后旧令牌失效、参数校验 422、停用账号无法登录、Swagger 可访问。

## 设计要点（相对老系统的改进）

1. **契约先行**：接口统一 `/api/v1` 前缀、统一响应 `{code,message,data,traceId}`、分页结构统一；Swagger 为唯一契约来源，杜绝老系统「前端调的接口后端不存在」。
2. **单一连接池 + 参数化 SQL**：去掉老系统两个重复连接池；所有查询走 `db/pool.ts`，事务用 `withTransaction`。
3. **默认安全**：所有写接口 = 登录 + 权限点 + zod 校验 + 审计日志；登录接口 10 分钟 20 次限流；密码 bcrypt 存储、强度校验；生产环境强制替换默认 JWT 密钥。
4. **令牌策略**：access 15 分钟、refresh 7 天且存 sha256 哈希，刷新即旋转（旧令牌立刻失效），支持停用/改密时强制下线。
5. **权限落地**：菜单、路由、按钮三级都由权限码驱动（后端 `requirePermission`，前端 `v-permission` + 路由 meta + 动态菜单）。
6. **可运维**：`/health` 带数据库探活，traceId 贯穿响应与日志，Docker Compose 一键起 MySQL（含 healthcheck）。
7. **通知不阻塞业务**：审核/评论/回复/关注事件写通知时失败只记日志，绝不影响主流程；通知按用户强隔离。
8. **批量与导入容错**：批量操作逐条执行并返回 `{affected, skipped, errors[]}`；Excel 导入按标题去重、缺字段跳过、分类标签自动创建。
9. **中文检索**：MySQL 5.7 默认分词对中文无效，改用 `WITH PARSER ngram` 全文索引，并保留 LIKE 兜底。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run setup` | 安装前后端依赖 |
| `npm run db:migrate` | 执行 SQL 迁移与种子（幂等） |
| `npm run seed:content` | 写入演示内容（42 篇真实文章 + 分类/标签/评论/互动/审核记录，可重复执行） |
| `npm run dev:server` / `npm run dev:web` | 分别启动后端 / 前端 |
| `npm run build` | 后端 tsc 构建 + 前端生产构建 |
| `npm test` | 后端单测 + 前端类型检查 |
| `powershell -File scripts/smoke-test.ps1` | M2 端到端冒烟（认证/RBAC/审计/令牌旋转，24 项） |
| `node scripts/smoke-m3.mjs` | M3 端到端冒烟（内容域全部能力，44 项，含 multipart 上传） |
| `node scripts/smoke-m4.mjs` | M4 端到端冒烟（头像上传与关注管理，19 项） |
| `node scripts/smoke-m5.mjs` | M5 端到端冒烟（楼中楼/通知/批量/Excel/全文检索，33 项） |
| `npm --prefix apps/web run test:e2e` | Playwright 浏览器级 E2E（自动拉起前后端，14 个用例） |
| `powershell -File scripts/backup-db.ps1` | 数据库备份（保留最近 N 份） |
| `node scripts/db-report.mjs` | 数据库自检：表、索引、权限与老库隔离 |

## 注意事项

- 新系统使用独立数据库 `htglxt_v2`，与老系统 `htglxt_db` 完全隔离，可并行对照。
- 生产环境启动前必须替换 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`，否则启动即报错（这是刻意设计的保护）。
- 老系统遗留的 `src/views/article/*.vue` 两个空占位文件未改动；重写后的前端在 `apps/web`。
