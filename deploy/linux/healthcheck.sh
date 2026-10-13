#!/usr/bin/env bash
# 部署自检：容器健康状态 + 首页 + 接口 + 静态资源
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE="docker/.env"
DOMAIN="$(grep '^CORS_ORIGIN=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | sed 's#https\?://##')"
PROTO="https"; grep -q '^CORS_ORIGIN=https' "$ENV_FILE" 2>/dev/null || PROTO="http"

ok=0; bad=0
check() { # 名称 期望 实际
  if [ "$2" = "$3" ]; then printf '  ✅ %-18s %s\n' "$1" "$3"; ok=$((ok+1));
  else printf '  ❌ %-18s 期望 %s，实际 %s\n' "$1" "$2" "$3"; bad=$((bad+1)); fi
}

echo "== 容器状态 =="
for c in htglxt-api htglxt-web; do
  status=$(docker inspect --format '{{.State.Status}}' "$c" 2>/dev/null || echo "missing")
  check "$c" "running" "$status"
done
apiHealth=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' htglxt-api 2>/dev/null || echo "missing")
check "api 健康检查" "healthy" "$apiHealth"

echo "== HTTP 探测（$PROTO://$DOMAIN）=="
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$PROTO://$DOMAIN/" || echo "000")
check "首页" "200" "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$PROTO://$DOMAIN/api/v1/menus" || echo "000")
check "接口(未登录401)" "401" "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$PROTO://$DOMAIN/metrics" || echo "000")
check "指标已屏蔽" "403" "$code"

echo
if [ "$bad" -eq 0 ]; then echo "全部通过（$ok 项）"; exit 0; else echo "有 $bad 项未通过"; exit 1; fi
