# 本机 Docker Desktop 安装与演练指南（Windows 11）

> 目的：在你这台机器上先把「生产那套镜像 + 空系统迁移」完整跑一遍，确认没问题再上阿里云。
> 演练用 **8090** 端口，不影响当前正在运行的本机服务（nginx 8080 + Node 3001）。

## 0. 本机实测前置条件（已探明）

| 项 | 实测结果 | 结论 |
| --- | --- | --- |
| 系统 | Windows 11 家庭中文版 Build 26200 | ✅ 满足 Docker Desktop 要求 |
| 内存 | 15.7 GB（当前可用 4.9 GB） | ⚠️ Docker 建议限 5 GB，给本机服务留余量 |
| C 盘可用 | **12.6 GB** | ⚠️ **必须把 Docker 数据目录改到 D 盘**（D 盘剩 73 GB） |
| 当前用户 | `阿稚\31513`，属 Administrators 组但当前未提权 | ⚠️ 安装时会弹 UAC，点「是」即可 |
| WSL2 | **未安装** | ⚠️ 安装过程会提示安装 WSL2，**需要重启电脑** |

## 1. 安装 Docker Desktop

1. 双击 D 盘那个安装包（`Docker Desktop Installer.exe`）。
2. 安装向导里保持勾选 **Use WSL 2 instead of Hyper-V**（Win11 家庭版没有 Hyper-V，必须 WSL2）。
3. 出现 **Install WSL 2 kernel update / 需要重启** 时，照做：**先重启**，再启动 Docker Desktop。
4. 首次启动：接受服务协议 → 登录可以点 **Skip**（不登录也能用）→ 等左下角出现 **Engine running**。

## 2. 装完立刻做的 5 项配置（重要）

打开 Docker Desktop → 右上角齿轮 **Settings**：

### ① 把数据目录挪到 D 盘（C 盘只剩 12.6 GB，必做）
`Resources` → `Advanced` → **Disk image location** 改成 `D:\Docker\data` → Apply & restart。
（Docker 的镜像、容器层、MySQL 数据卷都在这个目录下，后续占用会长到几个 GB。）

### ② 限制资源占用
同一页：**CPUs = 4**、**Memory = 5 GB**、**Swap = 1 GB**。
你机器上还跑着本机 nginx + Node + MySQL 5.7，别让 Docker 把内存吃光。

### ③ 关掉开机自启（按需）
`General` → 取消 **Start Docker Desktop when you sign in**。不搞 Docker 时可以彻底退出，省内存。

### ④ 配置国内镜像加速（拉镜像才快）
`Docker Engine` → 在 JSON 里加 `registry-mirrors`，改成你自己的阿里云专属地址（控制台 → 容器镜像服务 → 镜像工具 → 镜像加速器）后 Apply & restart：

```json
{
  "registry-mirrors": [
    "https://<你的ID>.mirror.aliyuncs.com"
  ],
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

> 注意：2024 年后多个公共镜像站已失效，别照抄网上的 ustdc/163 之类；阿里云控制台给你的专属地址最稳。

### ⑤ 验证安装

```powershell
docker version            # 能看到 Client 与 Server 两段
docker compose version    # 应输出 v2.x
docker run --rm hello-world   # 能打印 Hello from Docker!
```

## 3. 本机演练：完整跑一遍生产流程

工件已经准备好：`docker/docker-compose.rehearsal.yml` + `docker/.env.rehearsal`。

```powershell
cd E:\Desktop\try-again\vue-htglxt

# 3.1 构建 api + web 两个镜像（首次 3~8 分钟，取决于网速）
docker compose -f docker/docker-compose.rehearsal.yml --env-file docker/.env.rehearsal build

# 3.2 执行「生产模式」迁移：只建表 + 权限/角色/菜单 + 1 个管理员（无演示数据）
docker compose -f docker/docker-compose.rehearsal.yml --env-file docker/.env.rehearsal --profile tools run --rm migrate

# 3.3 启动
docker compose -f docker/docker-compose.rehearsal.yml --env-file docker/.env.rehearsal up -d

# 3.4 看状态（等 api 变成 healthy）
docker compose -f docker/docker-compose.rehearsal.yml --env-file docker/.env.rehearsal ps
```

浏览器打开 **http://localhost:8090**，用演练账号登录：

| 账号 | 密码 |
| --- | --- |
| `admin` | `Rehearsal@2026`（在 `docker/.env.rehearsal` 的 `SEED_ADMIN_PASSWORD`） |

## 4. 演练验收清单（对应生产验收）

- [ ] 能登录，且系统里**只有 admin 一个账号**、没有任何示例文章/分类/标签/违禁词（证明 `SEED_DEMO=false` 生效）
- [ ] 左侧菜单正常（全站文章 / 我的文章 / 全站评论 / 我的评论 / 系统管理）
- [ ] 写一篇文章提交 → 走自动审核（无违禁词时按信任策略：新库只有 admin，admin 有全部权限属可信作者）
- [ ] 打开「系统管理 → 违禁词库」，新增一个词 → 提交含该词的文章 → 被自动驳回
- [ ] 上传封面图 → 图片能正常显示（验证 uploads 卷）
- [ ] 导出 PDF 报表能下载（**验证容器里的中文字体**——这一步最容易出问题）
- [ ] 导出 Excel / 下载导入模板各一次（验证 `client_max_body_size`）
- [ ] 访问 `http://localhost:8090/metrics` 应返回 403（Nginx 层已屏蔽）

## 5. 演练结束后的清理

```powershell
# 停服务并删除演练数据卷（MySQL 数据与上传文件都会清掉）
docker compose -f docker/docker-compose.rehearsal.yml --env-file docker/.env.rehearsal down -v

# 顺手清理构建缓存与悬空镜像（能回收几个 GB）
docker system prune -f
docker builder prune -f
docker system df          # 查看实际占用
```

## 6. 本机演练 → 阿里云生产：差异对照

| 项 | 本机演练 | 阿里云生产 |
| --- | --- | --- |
| compose 文件 | `docker-compose.rehearsal.yml` | `docker-compose.prod.yml` |
| 环境变量 | `docker/.env.rehearsal` | `docker/.env`（由 `.env.production.example` 复制） |
| 数据库 | 本机 MySQL 容器 | 阿里云 RDS（`DB_HOST` 填内网地址） |
| 端口 | web 映射 `8090:80` | web 映射 `80:80` + `443:443` |
| Nginx 配置 | 镜像内置 HTTP 配置 | `deploy/nginx/active.conf`（先 http-only，再切 HTTPS） |
| 迁移 | `--profile tools run --rm migrate` | 同左，由 `deploy/linux/deploy.sh` 自动执行 |
| 备份 | 不需要 | `deploy/linux/backup.sh` + crontab + RDS 自动备份 |
| 证书 | 不需要 | 阿里云免费证书 或 Let's Encrypt |

> 换句话说：**本机演练跑通 = 上阿里云只剩「换 env、换端口、加证书」三件事**，这正是先在本机演练的价值。
## 7. 演练中实测发现并修复的问题（这轮的最大价值）

本机 Docker 演练不是走个过场——它抓出了 **3 个「本地能跑、容器必挂」的真问题**，都已修复并复测通过：

### ① 前端镜像构建失败：`@types/node` 缺失（monorepo 提升陷阱）

```
vite.config.ts(1,36): error TS2307: Cannot find module 'node:url'
```

| | 本地 | 容器 |
| --- | --- | --- |
| `apps/web/package.json` 是否声明 `@types/node` | ❌ 没有 | ❌ 没有 |
| 类型从哪来 | **`E:\Desktop\try-again\node_modules\@types\node`**（旁边老项目装的，TS 向上查找 node_modules 命中） | 没有父目录 → 直接报错 |

**修复**：在 `apps/web/package.json` 显式声明 `@types/node` 并更新锁文件（依赖要用就必须声明，不能靠环境巧合）。

### ② PDF 报表 500：`.ttc` 字体集合要传 PostScript 名，不是家族名

```
Not a supported font format or standard PDF font.
at PDFFontFactory.open (/app/node_modules/pdfkit/js/pdfkit.js:2829)
```

- 根因：pdfkit 0.15 依赖的 fontkit 1.9 **不支持 `.ttc` 集合**；Windows 上恰好第一个命中 `simhei.ttf`（单面字体）所以一直没暴露，容器里第一个命中 Noto 的 `.ttc` 就炸了。
- 修复分两步：
  1. **升级 `pdfkit` 0.15.2 → 0.20.2**（依赖 fontkit 2.x，支持读取集合）
  2. **按 PostScript 名取面**：`doc.font(path, 'NotoSansCJKsc-Regular')`；传家族名（Noto Sans CJK SC）仍然失败
- 候选表已按「路径 + PostScript 名 + 家族名」组织，并做了**逐候选容错**（集合先试 PostScript 名、再试家族名，某个字体坏了自动换下一个）
- 新增环境变量：`PDF_FONT_PATH`（字体文件）+ `PDF_FONT_POSTSCRIPT`（集合用 PostScript 名）+ `PDF_FONT_FAMILY`（兜底）

实测结果：本机默认（simhei.ttf）18 KB `%PDF-`；强制 `.ttc`（msyh.ttc + MicrosoftYaHei）44.5 KB；容器内（Noto）**71.8 KB**。

### ③ 空系统里管理员发文会排队等自己审（设计问题）

生产是空库，`admin` 已发布 0 篇 → 按「发布 ≥3 篇才算可信」规则转人工，于是出现「管理员审自己的文章」这种空转。

**修复**：`resolveTrust()` 增加一条——**内容管理者（有 `article:manage` 或 `article:audit`）直接视为可信**。信任不等于放行：实测命中违禁词依旧被驳回。

### 附：两个容易误判的现象

- 容器内 **npm 走 npmmirror**：Dockerfile 已加 `ARG NPM_REGISTRY`（默认 `registry.npmmirror.com`），否则容器里 `npm ci` 走 npmjs.org 又慢又容易断。
- `docker compose build` 报 exit code 1 但日志里 0 条 error：这是 PowerShell 把 docker 写在 **stderr 的进度输出**当成错误，属假报警；判断成败以 `Image xxx Built` 为准。

## 8. 演练实测结果（`SEED_DEMO=false` + Docker）

| 验收项 | 结果 |
| --- | --- |
| 迁移执行 | 001~008 全部执行，**099_demo_seed.sql 被跳过** |
| 空系统数据 | `users=1(admin) articles=0 categories=0 tags=0 words=0 permissions=42 menus=19` |
| 首页 | `http://localhost:8090/` → 200 |
| 未登录接口 | 401 |
| `/metrics` | 403（Nginx 屏蔽） |
| 登录 | admin / `Rehearsal@2026` → code=0，权限 7 |
| 图片上传 | `POST /api/v1/upload/image` → url `/uploads/2026/09/xxx.png`，回读 200（uploads 卷正常） |
| **PDF 中文报表** | **200，71.8 KB，`%PDF-`**（Noto CJK 已嵌入） |
| 自动审核（可信） | 内容管理者发文 → `pass` / status=2 自动发布 |
| 自动审核（违禁） | 命中违禁词 → `reject` / status=3 + 审核记录 `auto_reject`（含命中词、operator=system） |
