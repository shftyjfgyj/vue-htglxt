-- =====================================================================
-- M5 增量：通知中心 + 中文全文检索索引（MySQL 5.7 ngram）
-- 幂等：可重复执行
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id    INT UNSIGNED NOT NULL COMMENT '接收人',
  type       VARCHAR(30)  NOT NULL COMMENT 'audit|comment|reply|follow|like|system',
  title      VARCHAR(120) NOT NULL,
  content    VARCHAR(500) NOT NULL DEFAULT '',
  link       VARCHAR(255) NOT NULL DEFAULT '' COMMENT '前端跳转路径',
  actor_id   INT UNSIGNED NULL COMMENT '触发者',
  is_read    TINYINT      NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_notifications_user (user_id, is_read, id),
  KEY idx_notifications_created (created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='站内通知';

-- 中文全文检索：MySQL 5.7 默认分词器按空格切分，中文需要 ngram 解析器
SET @has_ngram := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND INDEX_NAME = 'ft_articles_ngram'
);
SET @ddl := IF(@has_ngram = 0,
  'ALTER TABLE articles ADD FULLTEXT INDEX ft_articles_ngram (title, summary, content) WITH PARSER ngram',
  'SELECT ''ft_articles_ngram already exists'' AS note');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
