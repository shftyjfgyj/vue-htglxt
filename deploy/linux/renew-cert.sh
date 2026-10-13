#!/usr/bin/env bash
# =====================================================================
# 证书处理：兼容两种方式
#   A) 阿里云免费证书（推荐，最省事）：在控制台签发后下载 Nginx 格式，
#      把 .pem/.key 覆盖到 deploy/nginx/certs/，再执行本脚本
#   B) Let's Encrypt：bash deploy/linux/renew-cert.sh --letsencrypt
# =====================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

CERT_DIR="deploy/nginx/certs"
COMPOSE_FILE="docker/docker-compose.prod.yml"
ENV_FILE="docker/.env"
DOMAIN="$(grep '^CORS_ORIGIN=' "$ENV_FILE" | cut -d= -f2 | sed 's#https\?://##')"

if [ "${1:-}" = "--letsencrypt" ]; then
  echo "使用 Let's Encrypt 签发/续期（域名：$DOMAIN）"
  [ -f deploy/nginx/active.conf ] && grep -q "listen 80" deploy/nginx/active.conf \
    || { echo "请先把 active.conf 切到 http-only 配置再申请证书"; exit 1; }
  docker run --rm \
    -v "$PWD/$CERT_DIR":/etc/letsencrypt \
    -v htglxt_certbot-webroot:/var/www/certbot \
    certbot/certbot certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" -d "www.$DOMAIN" --email "admin@$DOMAIN" --agree-tos --no-eff-email
  cp "$CERT_DIR/live/$DOMAIN/fullchain.pem" "$CERT_DIR/fullchain.pem"
  cp "$CERT_DIR/live/$DOMAIN/privkey.pem"   "$CERT_DIR/privkey.pem"
else
  echo "使用你放入 $CERT_DIR 的证书"
  [ -f "$CERT_DIR/fullchain.pem" ] || { echo "缺少 $CERT_DIR/fullchain.pem"; exit 1; }
  [ -f "$CERT_DIR/privkey.pem" ]   || { echo "缺少 $CERT_DIR/privkey.pem"; exit 1; }
fi

echo "切换 Nginx 到 HTTPS 配置并重载"
cp deploy/nginx/htglxt.prod.conf deploy/nginx/active.conf
# 把 server_name 换成真实域名（模板里是 your-domain.com）
sed -i "s/your-domain.com/$DOMAIN/g; s/www\.$DOMAIN www\.$DOMAIN/www.$DOMAIN/g" deploy/nginx/active.conf

docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d web
sleep 3
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec web nginx -s reload || true

echo "证书已生效：https://$DOMAIN"
echo "提醒：阿里云免费证书有效期 1 年，到期前重新下载覆盖本目录再执行一次本脚本"
