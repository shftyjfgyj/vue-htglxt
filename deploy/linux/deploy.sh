#!/usr/bin/env bash
# =====================================================================
# 阿里云 ECS 一键部署 / 升级（Docker Compose + RDS）
# 用法：bash deploy/linux/deploy.sh
# 首次部署前请先按 docs/部署-阿里云ECS与RDS.md 完成 3~6 步
# =====================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE="docker/.env"

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || fail "未安装 Docker，请先执行文档第 4 步"
docker compose version >/dev/null 2>&1 || fail "缺少 docker compose 插件（apt install docker-compose-plugin）"

[ -f "$ENV_FILE" ] || fail "缺少 $ENV_FILE。请先：cp docker/.env.production.example docker/.env 并填写"
chmod 600 "$ENV_FILE" 2>/dev/null || true

grep -q 'your-domain.com' "$ENV_FILE" && fail "CORS_ORIGIN 还是模板值，请改成你的域名"
grep -q 'openssl输出' "$ENV_FILE" && fail "JWT 密钥还是模板值，请用 openssl rand -hex 32 生成"
grep -q '^SEED_DEMO=false' "$ENV_FILE" || warn "SEED_DEMO 不是 false：生产会灌入演示账号与演示内容！"

[ -f deploy/nginx/active.conf ] || fail "缺少 deploy/nginx/active.conf。首次：cp deploy/nginx/htglxt.prod.http-only.conf deploy/nginx/active.conf"
if grep -q "listen 443" deploy/nginx/active.conf && [ ! -f deploy/nginx/certs/fullchain.pem ]; then
  fail "active.conf 是 HTTPS 版但缺少证书，请先完成文档第 7 步（或先切回 http-only 配置）"
fi

log "1/4 构建镜像"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --pull

log "2/4 执行数据库迁移（SEED_DEMO=false，只建表与基础权限）"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" --profile tools run --rm migrate

log "3/4 启动服务"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

log "4/4 健康检查"
sleep 8
bash deploy/linux/healthcheck.sh || fail "健康检查未通过：docker compose -f $COMPOSE_FILE logs --tail=200"

DOMAIN="$(grep '^CORS_ORIGIN=' "$ENV_FILE" | cut -d= -f2 | sed 's#https\?://##')"
log "完成 ✅ 访问 https://$DOMAIN （首次迁移的管理员密码见 SEED_ADMIN_PASSWORD）"
