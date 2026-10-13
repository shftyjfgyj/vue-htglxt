-- =====================================================================
-- M14 评论互动：点赞（含反范式计数）+ @提及
-- 幂等：可重复执行
-- =====================================================================

-- ---------- 1) 评论点赞表 ----------
CREATE TABLE IF NOT EXISTS comment_likes (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  comment_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_comment_like (comment_id, user_id),
  KEY idx_comment (comment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='评论点赞';

-- ---------- 2) comments.like_count ----------
-- 与 articles.like_count 同样的反范式计数：列表要按热度排序与展示，
-- 每次 JOIN 聚合点赞表在评论量上来后会明显拖慢。
SET @has_like_count := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments' AND COLUMN_NAME = 'like_count');
SET @ddl := IF(@has_like_count = 0,
  'ALTER TABLE comments ADD COLUMN like_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''点赞数''',
  'SELECT ''like_count exists'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ---------- 3) 热度排序索引 ----------
SET @has_hot_index := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'comments' AND INDEX_NAME = 'idx_article_like');
SET @ddl := IF(@has_hot_index = 0,
  'ALTER TABLE comments ADD INDEX idx_article_like (article_id, like_count)',
  'SELECT ''idx_article_like exists'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
