# 部署 · 免费方案 A（Cloudflare Pages + Render + Aiven MySQL + R2）

> 全部**不需要信用卡**。代价是后端会休眠、资源有上限，适合演示与个人项目。

## 架构

```
浏览器
  │
  ├─ 前端 https://<项目>.pages.dev            Cloudflare Pages（静态，全球 CDN，不休眠）
  │     图片：/seed/* 随前端一起发布；用户上传物走 R2 绝对地址
  │
  ├─ 接口 https://htglxt-server.onrender.com  Render Free（Docker，空闲 15 分钟休眠）
  │     上传 → Cloudflare R2（S3 兼容，10GB 免费，无出网费）
  │
  └─ 数据 https://<实例>.aivencloud.com:port  Aiven for MySQL Free（1GB，永久免费）
```

## 关键前提（先看这三条，能省很多时间）

1. **`apps/server/uploads/` 在 `.gitignore` 里**，仓库里没有这些文件。所以线上必须用对象存储（`STORAGE_DRIVER=s3`），否则用户上传的封面和头像在重新部署后会全部消失。
2. **Aiven 强制要求 SSL**。项目已支持，把 `DB_SSL=require` 配上即可；不加会连不上，且报错不直观。
3. **迁移脚本要在本地跑**。生产镜像用 `npm ci --omit=dev`，没有 `tsx`，所以 `db:migrate` 不能在容器里执行 —— 你在本机配好 Aiven 连接信息跑一次即可。

---

## 第 0 步：把代码推到 GitHub

Render 和 Cloudflare Pages 都从 Git 仓库部署。

```bash
cd vue-htglxt
git init
git add .
git commit -m "init"
git remote add origin <你的仓库地址>
git push -u origin main
```

> 仓库里不要提交 `apps/server/.env`（已在 `.gitignore` 中）。所有密钥都通过平台的环境变量注入。

---

## 第 1 步：Aiven MySQL（数据库）

1. 注册 [aiven.io](https://aiven.io/) —— **不需要信用卡**。
2. Console → **Create service** → 选 **MySQL** → 计划选 **Free** → 区域建议选离你近的（如 Singapore）→ Create。
3. 等状态变成 **Running**（通常 2~5 分钟），在 **Overview** 页记下：
   - `Host`、`Port`（一般是 12345 之类的高位端口）
   - `User`（默认 `avnadmin`）、`Password`
   - **CA Certificate** 点下载（后面可选）

**免费档的边界（Aiven 官方文档）**：1 CPU / 1GB 内存 / 1GB 磁盘、单节点；每类服务每个组织只能有 1 个；`max_connections` 限制为 **76**；长期无活动会被关机（可以手动唤醒）；**没有时间限制**，可以一直免费用。

### 在本机跑一次迁移

编辑 `apps/server/.env`：

```ini
NODE_ENV=development          # 迁移时用 development，避免 JWT 生产校验干扰
DB_HOST=<Aiven Host>
DB_PORT=<Aiven Port>
DB_USER=avnadmin
DB_PASSWORD=<Aiven Password>
DB_DATABASE=defaultdb         # Aiven 自带这个库；也可自己建，填库名
DB_SSL=require                # 关键：Aiven 要求 SSL
```

然后：

```bash
npm run db:migrate      # 建表 + 权限/角色/菜单 + 管理员账号
npm run seed:content    # 可选：灌 42 篇演示文章、评论、封面等
```

跑完 `db:migrate` 的输出里应该能看到每个 `*.sql` 都执行成功。

---

## 第 2 步：Cloudflare R2（图片存储）

1. Cloudflare Dashboard → **R2** → **Create bucket**，名字例如 `htglxt`。
2. 进入 bucket → **Settings** → **Public access**：
   - 打开 **R2.dev subdomain**（会给你一个 `https://pub-xxxxxxxx.r2.dev`），或
   - 绑定自己的域名（更正式，且国内访问更稳）
   
   记下这个地址，就是 `S3_PUBLIC_BASE_URL`。
3. 右上角 **Manage API Tokens** → **Create API token**，权限选 **Object Read & Write**，限定到刚才的 bucket。记下：
   - **Access Key ID** → `S3_ACCESS_KEY_ID`
   - **Secret Access Key** → `S3_SECRET_ACCESS_KEY`
4. `S3_ENDPOINT` 形如 `https://<accountid>.r2.cloudflarestorage.com`（在 bucket 详情页能看到）。

> R2 免费额度：10GB 存储、每月 100 万次 A 类操作、1000 万次 B 类操作，**出网流量不计费**。对一个演示站点绰绰有余。

---

## 第 3 步：Render 部署后端

1. 注册 [render.com](https://render.com/) —— **不需要信用卡**。
2. **New** → **Blueprint** → 选择你的仓库。Render 会自动读取仓库根目录的 `render.yaml`。
3. 它会提示你填写标了 `sync: false` 的环境变量，逐个填：

   | 变量 | 填什么 |
   | --- | --- |
   | `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_DATABASE` | 第 1 步 Aiven 的连接信息 |
   | `CORS_ORIGIN` | 第 4 步的前端域名。**先随便填**，部署完前端再回来改成 `https://xxx.pages.dev` |
   | `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_PUBLIC_BASE_URL` | 第 2 步 R2 的信息 |

   `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 已配 `generateValue: true`，Render 会自动生成随机串（生产环境会拒绝 `dev-` 开头的默认值）。

4. 部署完成后访问 `https://<服务名>.onrender.com/health`，应返回 `{"code":0,"data":{"status":"up","db":"up"}}`。
   - `db":"down"` 说明数据库连不上 → 九成是 `DB_SSL` 没设成 `require`，或 Aiven 实例被关机了。

**免费档的边界**：750 实例小时/月、512MB 内存、0.1 CPU、5GB 出网流量；**空闲 15 分钟休眠**；免费 PostgreSQL **30 天后过期删除**（所以我们不用它，改用 Aiven）。

---

## 第 4 步：Cloudflare Pages 部署前端

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
2. 选择仓库，构建配置填：

   | 项 | 值 |
   | --- | --- |
   | Framework preset | None（或 Vue） |
   | **Root directory** | `apps/web` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

3. **Environment variables** 加一条：

   | 变量 | 值 |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://<你的 Render 服务>.onrender.com` |

   建议再加 `NODE_VERSION=22`，避免构建环境的 Node 版本过旧。

4. 保存并部署，拿到 `https://<项目>.pages.dev`。

> **SPA 回退已内置**：`apps/web/public/_redirects` 里有 `/*  /index.html  200`。
> 没有它，直接访问 `/dashboard` 这类深层地址会 404（开发时 Vite 帮忙兜了，容易忽略）。

---

## 第 5 步：收尾（别漏）

回到 Render，把 `CORS_ORIGIN` 改成真实的前端域名（多个用逗号分隔），保存后重新部署。

不改的话，前端所有带凭证的请求会被浏览器的 CORS 拦掉。

登录用 `admin` / `.env` 里的 `SEED_ADMIN_PASSWORD`（默认 `Admin@123456`，**强烈建议改掉**）。

---

## 关于冷启动

Render 免费实例空闲 15 分钟休眠，下一个请求要等约 30~60 秒。这个项目从两个方向处理了：

**1. 前端自动等待（已内置，无需配置）**

`apps/web/src/api/http.ts` 里做了冷启动宽限：遇到 `502/503/504` 或连不上时，GET 请求会自动每 4 秒重试一次（最多 12 次 ≈ 48 秒），期间弹一条「后端服务正在唤醒，首次请求约需 30~60 秒」的提示。

- **写请求不自动重放**，避免重复提交；会提示你稍后手动重试。
- 生产构建默认开启；本地开发默认关闭（本地后端不存在唤醒问题，重试只会拖慢报错）。
- 想强制开启/关闭：设 `VITE_WAKE_GRACE=on` / `off`。

**2. 保活（可选）**

仓库里带了 `.github/workflows/keep-alive.yml`，每 10 分钟 ping 一次 `/health`。启用方式：在 GitHub 仓库 Settings → Secrets → Actions 里加 `RENDER_HEALTH_URL`。

小时预算算得过来：免费档 750 小时/月，一个月约 730 小时，**一个服务常开刚好放得下**；但如果你以后再加第二个免费服务，就会互相抢这 750 小时。

已知限制：GitHub 定时任务会延迟、仓库 60 天无提交会被自动停用。想更准时可以用 UptimeRobot 或 cron-job.org。

---

## 排错

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `/health` 返回 `db":"down"` | Aiven 未启用 SSL / 实例被关机 | 确认 `DB_SSL=require`；去 Aiven 控制台把实例 Power on |
| 部署后 `Error: STORAGE_DRIVER=s3 时缺少配置：xxx` | R2 的环境变量没填全 | 补齐 `S3_*` 五项 |
| 上传成功但图片显示不出来 | `S3_PUBLIC_BASE_URL` 不对，或 R2 没开公开访问 | 浏览器直接打开返回的 URL 验证；检查 bucket 的 Public access |
| 页面能开但接口全 CORS 报错 | `CORS_ORIGIN` 没含前端域名 | 在 Render 里补上并重新部署 |
| 深层地址 404 | `_redirects` 没随构建产物发布 | 确认部署产物根目录有 `_redirects` |
| 头像/封面在重新部署后变空 | 没有用 s3 驱动 | 确认 `STORAGE_DRIVER=s3` |
| 连接报 `Too many connections` | Aiven 免费档只有 76 个连接 | 把 `DB_CONNECTION_LIMIT` 降到 5 以内 |
| 构建报 Node 版本相关错误 | Pages 默认 Node 偏旧 | 加环境变量 `NODE_VERSION=22` |

---

## 与「同域 nginx」方案的关系

仓库里原有的 `apps/web/nginx.conf` + `Dockerfile` 那套是**同域部署**方案（nginx 同时托管前端静态文件并把 `/api`、`/uploads` 反代到后端），适合一台 VPS。

本方案 A 是**前后端分离**：API 在独立域名，因此

- 前端必须设 `VITE_API_BASE_URL`（同域方案留空即可）
- 用户上传物必须用对象存储返回绝对地址（同域方案可以直接用 `/uploads/...` 相对路径）
- 种子封面放在前端静态目录 `/seed/...`，**两套方案都适用**，因为都由前端自己服务
