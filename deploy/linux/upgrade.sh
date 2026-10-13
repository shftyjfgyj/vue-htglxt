#!/usr/bin/env bash
# 代码更新后的安全升级（含回滚提示）
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE="docker/.env"

echo "== 当前镜像 =="
docker images | grep htglxt || true

echo "== 拉取最新代码 =="
if [ -d .git ]; then git pull --ff-only; else echo "（不是 git 仓库，跳过 git pull）"; fi

echo "== 重新构建 =="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo "== 更新后端（前端静态资源随镜像一起更新）=="
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

sleep 8
bash deploy/linux/healthcheck.sh

cat <<'EOF'
回滚方法：
  1) 代码回退：git checkout <上一个提交>
  2) 重新构建并启动：bash deploy/linux/deploy.sh
  注意：数据库迁移是"只增不减"的（不会删列），回滚代码一般无需回滚库；
        若本次升级包含 99x 演示数据脚本，生产不会被影响（SEED_DEMO=false 会跳过）。
EOF
