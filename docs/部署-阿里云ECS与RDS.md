# 部署手册 · 阿里云 ECS + RDS MySQL + 域名 HTTPS（Docker Compose）

> 你的选择：**大陆地域（需备案）** + **Docker Compose** + **阿里云 RDS MySQL** + **生产空系统（无演示数据）**。
> 本手册按这个组合从「买东西」写到「验收上线」，命令可直接复制。

## 0. 架构与已有工件

```
用户 → 域名(HTTPS) → ECS 安全组(80/443) → htglxt-web 容器(Nginx)
                                            ├─ /          → 容器内 apps/web/dist
                                            ├─ /api       → htglxt-api 容器:3001
                                            └─ /uploads   → htglxt-api 容器:3001
                                          htglxt-api 容器 → 阿里云 RDS MySQL（内网）
```

| 工件 | 说明 |
| --- | --- |
| `docker/docker-compose.prod.yml` | 生产编排：api + web（+ 可选 migrate 作业、certbot） |
| `docker/.env.production.example` | 生产环境变量模板（复制为 `docker/.env`） |
| `deploy/nginx/htglxt.prod.conf` | HTTPS 版 Nginx（HTTPS + 反代 + 缓存 + 屏蔽 /metrics） |
| `deploy/nginx/htglxt.prod.http-only.conf` | 首次上线用的 HTTP-only 版（拿证书前） |
| `deploy/linux/deploy.sh` | 一键部署/首次上线 |
| `deploy/linux/upgrade.sh` | 升级（含回滚说明） |
| `deploy/linux/healthcheck.sh` | 自检：容器健康 + 首页 + 接口 + 指标屏蔽 |
| `deploy/linux/backup.sh` | RDS 逻辑备份 + 上传文件打包（保留 14 天） |
| `deploy/linux/renew-cert.sh` | 证书替换（阿里云证书 / Let's Encrypt 两种） |

## 1. 购买清单（参考价，活动价更低）

| 资源 | 建议规格 | 参考价 |
| --- | --- | --- |
| ECS | 2 核 4G、系统盘 40G ESSD、带宽 3~5M | ¥70~120/月 |
| 域名 | .com / .cn | ¥60~80/年 |
| RDS MySQL | 8.0 基础版、1 核 2G、20G、与 ECS **同地域** | ¥50~80/月 |
| SSL 证书 | 阿里云免费 DV 证书（**90 天**，每年限 20 张）或 Pro 版 ¥18/6 个月 | ¥0 / ¥18 |
| 快照/备份 | RDS 自带备份；ECS 建议开快照 | 几元~几十元 |

**同地域**很关键：ECS 走 RDS 内网地址，延迟低且不计公网流量。

## 2. 备案（大陆服务器必须）

1. 域名在阿里云完成**实名认证**（1~3 天）。
2. 控制台 → 备案 → 新增备案：主体信息 + 网站信息（网站名称别用敏感词），需幕布拍照/人脸核验。
3. 阿里云初审 1~2 天 → 管局审核 **7~20 天**（各省不同）。
4. 备案通过后才能用 80/443 对外提供服务；期间可用 IP + 端口先自测。

> 想当天上线就选香港/新加坡节点（免备案），其余步骤完全一致，只是延迟高一些。

## 3. 安全组（只开三个端口）

| 方向 | 协议 | 端口 | 授权对象 | 用途 |
| --- | --- | --- | --- | --- |
| 入 | TCP | 22 | 你的公网 IP/32 | SSH（强烈建议只放自己的 IP） |
| 入 | TCP | 80 | 0.0.0.0/0 | HTTP（ACME 校验 + 跳转 HTTPS） |
| 入 | TCP | 443 | 0.0.0.0/0 | HTTPS |

⚠️ **不要**开 3001（后端）与 3306（数据库）：容器网络内部互通，公网无需暴露。

## 4. ECS 初始化

```bash
# 4.1 登录（把 IP 换成你的）
ssh root@<ECS 公网 IP>

# 4.2 时区与基础工具
timedatectl set-timezone Asia/Shanghai
apt update && apt install -y curl git ca-certificates

# 4.3 安装 Docker + compose 插件（官方脚本，国内可用）
curl -fsSL https://get.docker.com | bash -s docker --mirror Aliyun
systemctl enable --now docker
docker compose version    # 应输出 v2.x

# 4.4 目录约定
mkdir -p /opt/htglxt /opt/htglxt-backups && cd /opt/htglxt
```

## 5. 配置 RDS

1. **创建实例**：8.0 基础版，与 ECS 同地域、同 VPC（不同 VPC 需走公网，慢且贵）。
2. **创建数据库**：控制台 → 数据库管理 → 创建库，名字 `htglxt_v2`，字符集 `utf8mb4`，排序规则 `utf8mb4_unicode_ci`。
   > 必须提前建好：RDS 普通账号没有 `CREATE DATABASE` 权限（迁移脚本已容错，会跳过建库直接使用已有库）。
3. **创建账号**：例如 `htglxt`，授予库 `htglxt_v2` 的读写权限（不要用高权限账号跑应用）。
4. **白名单**：把 ECS 的**内网 IP** 加进去（不是公网 IP）。
5. **确认参数** `ngram_token_size`：默认即 `2`，中文全文检索依赖它；若被改过请改回 2 并重启实例。
6. **备份策略**：开启自动备份，保留 7~30 天。

## 6. 上传代码并配置环境变量

```bash
cd /opt/htglxt
# 方式一：git（推荐，升级方便）
git clone <你的仓库地址> .
# 方式二：本机打包上传
#   scp htglxt.tar.gz root@<IP>:/opt/htglxt && tar xzf htglxt.tar.gz

# 生成两个 JWT 密钥（各 32 字节十六进制）
openssl rand -hex 32   # 填 JWT_ACCESS_SECRET
openssl rand -hex 32   # 填 JWT_REFRESH_SECRET

cp docker/.env.production.example docker/.env
vi docker/.env         # 填 RDS 内网地址、账号密码、CORS_ORIGIN=https://你的域名、SEED_DEMO=false
chmod 600 docker/.env
```

## 7. 首次上线：先 HTTP 验证，再切 HTTPS

```bash
cd /opt/htglxt
# 7.1 先用 HTTP-only 配置（此时还没有证书）
cp deploy/nginx/htglxt.prod.http-only.conf deploy/nginx/active.conf

# 7.2 一键部署：构建 → 迁移（SEED_DEMO=false，空系统）→ 启动 → 自检
bash deploy/linux/deploy.sh
```

迁移完成后数据库里只有：**42 条权限、3 个角色、19 个菜单、1 个管理员账号**，没有演示文章/分类/标签/违禁词。
管理员密码 = `docker/.env` 里的 `SEED_ADMIN_PASSWORD`，登录后请立刻修改。

```bash
# 7.3 域名解析：控制台添加 A 记录 your-domain.com → ECS 公网 IP（www 也加一条）
#     解析生效后访问 http://你的域名 应能正常登录使用
```

**申请证书（二选一）**

```bash
# 方式 A（推荐，最省事）：阿里云控制台申请免费 DV 证书 → 下载 Nginx 格式
#   把 .pem 改名 fullchain.pem、.key 改名 privkey.pem，放到 deploy/nginx/certs/
scp fullchain.pem privkey.pem root@<IP>:/opt/htglxt/deploy/nginx/certs/
bash deploy/linux/renew-cert.sh

# 方式 B：Let's Encrypt 自动签发（需要 80 端口可达，即备案已完成）
bash deploy/linux/renew-cert.sh --letsencrypt
```

脚本会把 `active.conf` 换成 HTTPS 版、替换 server_name、重启 web 容器并 reload。之后访问 `https://你的域名`。

## 8. 备份与日常运维

```bash
# 手动备份一次（RDS 逻辑备份 + 上传文件）
bash deploy/linux/backup.sh

# 每天凌晨 3 点自动备份
crontab -e
0 3 * * * cd /opt/htglxt && bash deploy/linux/backup.sh >> /var/log/htglxt-backup.log 2>&1

# 常用排障命令
docker compose -f docker/docker-compose.prod.yml ps
docker compose -f docker/docker-compose.prod.yml logs -f api --tail=200
docker compose -f docker/docker-compose.prod.yml logs -f web --tail=100
bash deploy/linux/healthcheck.sh
```

## 9. 升级与回滚

```bash
# 升级（拉代码 → 重建 → 滚动更新 → 自检）
git pull && bash deploy/linux/upgrade.sh

# 回滚：代码回退到上一个提交后重新部署
git log --oneline -5
git checkout <上一个提交>
bash deploy/linux/deploy.sh
```

数据库迁移只增不减（新增表/列），回滚代码通常无需回滚库；生产 `SEED_DEMO=false` 会跳过 `099_*.sql` 演示脚本。

## 10. 上线验收清单

- [ ] `bash deploy/linux/healthcheck.sh` 全绿（容器 running、api healthy、首页 200、未登录接口 401、/metrics 403）
- [ ] 用 `SEED_ADMIN_PASSWORD` 登录成功，并**立即改成强密码**
- [ ] 新建一个用户 → 用新用户登录，确认权限边界正确（看不到系统管理）
- [ ] 写一篇文章提交：命中违禁词 → 被驳回；正常内容 → 按信任策略发布或转人工
- [ ] 上传一张封面图，确认 `/uploads/...` 能正常显示（图片不丢）
- [ ] 导出 PDF 报表能下载（验证中文字体已随镜像安装）
- [ ] 导出 Excel、下载导入模板各跑一次（验证上传体积与写权限）
- [ ] `https://你的域名` 证书有效，`http://` 自动跳转（**记下到期日：免费证书只有 90 天**）
- [ ] 手动执行一次 `backup.sh`，确认备份文件生成
- [ ] 关闭 SSH 密码登录，改用密钥对

## 11. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| api 容器起不来，日志提到 JWT 密钥 | 生产模式禁止 dev- 开头的密钥，用 `openssl rand -hex 32` 重新生成 |
| 迁移报 CREATE DATABASE 权限不足 | 正常现象（已容错）：请先在 RDS 控制台建好 `htglxt_v2` 库 |
| 页面能开但接口 401 / 跨域报错 | `CORS_ORIGIN` 必须与访问域名完全一致（含 https） |
| PDF 报表 500：字体相关错误 | 用本仓库的 `apps/server/Dockerfile`（已装 `fonts-noto-cjk` + pdfkit 0.20）。若要自建镜像：需装 CJK 字体并设 `PDF_FONT_PATH`；**`.ttc` 集合必须同时设 `PDF_FONT_POSTSCRIPT`**（如 `NotoSansCJKsc-Regular`），传家族名会报 Not a supported font format |
| 构建时拉不到 Docker Hub | 在 `docker/.env` 设 `NODE_IMAGE`/`NODE_IMAGE_WEB`/`NGINX_IMAGE` 指向阿里云专属加速地址；容器内 npm 源用 `NPM_REGISTRY` 控制 |
| 上传成功但图片 404 | 确认 `/uploads/` 反代存在且卷正常：`docker volume inspect htglxt_upload-data` |
| 中文搜索搜不到 | RDS 参数 `ngram_token_size` 必须为 2，改完重启实例；老数据需重建全文索引（见 `docs/数据库设计.md`） |
| 登录提示尝试过于频繁 | 生产 `LOGIN_RATE_LIMIT` 保持 20；确被误伤可临时调大并重启 api |
| nginx 报 host not found in upstream | 生产配置已用 `upstream` 块规避；自改配置时不要把容器名与变量混用在 `proxy_pass` |
| 容器重启后数据丢 | 上传在 `upload-data` 卷、数据在 RDS，均持久；自建 MySQL 需确认 `mysql-data` 卷 |

## 12. 安全清单

- [ ] 安全组只开 22/80/443；22 限制来源 IP
- [ ] RDS 白名单只放 ECS 内网 IP，且不用高权限账号跑应用
- [ ] `docker/.env` 权限 600，且不入库
- [ ] `SEED_DEMO=false`（空系统上线）
- [ ] `METRICS_TOKEN` 已设置，且 Nginx 层已 deny `/metrics` 公网访问
- [ ] 管理员密码已从初始值改掉；不需要的演示账号已删除
- [ ] ECS 快照（每周）+ RDS 自动备份已开启
- [ ] 定期 `docker image prune` 清理旧镜像

> 采购比价、优惠入口、备案服务码要求与证书续期方案，见 **`docs/阿里云采购指南.md`**（2026-10 核实）。
