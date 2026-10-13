#!/usr/bin/env bash
# =====================================================================
# 备份：RDS 逻辑备份 + 上传文件打包，保留 14 天
# 建议 crontab：0 3 * * * /opt/htglxt/deploy/linux/backup.sh >> /var/log/htglxt-backup.log 2>&1
#   （RDS 自带自动备份，这里是额外的"可拿到手里"的逻辑备份）
# =====================================================================
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."

ENV_FILE="docker/.env"
BACKUP_DIR="${BACKUP_DIR:-/opt/htglxt-backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
[ -n "${DB_HOST:-}" ] || { echo "无法从 $ENV_FILE 读取 DB 配置"; exit 1; }

mkdir -p "$BACKUP_DIR"

echo "[$(date '+%F %T')] 开始备份数据库 $DB_DATABASE@$DB_HOST"
# 用容器里的 mysqldump，宿主机不需要装 MySQL 客户端
docker run --rm mysql:8.0 \
  mysqldump -h"$DB_HOST" -P"${DB_PORT:-3306}" -u"$DB_USER" -p"$DB_PASSWORD" \
  --single-transaction --quick --default-character-set=utf8mb4 --set-gtid-purged=OFF \
  "$DB_DATABASE" | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

echo "[$(date '+%F %T')] 打包上传文件"
docker run --rm -v htglxt_upload-data:/data -v "$BACKUP_DIR":/backup alpine \
  tar czf "/backup/uploads-$STAMP.tar.gz" -C /data . || echo "（上传目录为空或卷名不同，可忽略）"

echo "[$(date '+%F %T')] 清理 $KEEP_DAYS 天前的备份"
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

ls -lh "$BACKUP_DIR" | tail -5
echo "[$(date '+%F %T')] 备份完成：$BACKUP_DIR/db-$STAMP.sql.gz"
