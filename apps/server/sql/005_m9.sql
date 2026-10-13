-- =====================================================================
-- M9 阅读与订阅：阅读历史 + 收藏分组 + 关注动态菜单
-- 幂等：可重复执行
-- =====================================================================

-- 阅读历史：每人每篇只保留最近一次阅读时间，便于「最近在看」
CREATE TABLE IF NOT EXISTS article_view_logs (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  viewed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_view_article_user (article_id, user_id),
  KEY idx_view_user_time (user_id, viewed_at),
  CONSTRAINT fk_view_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章阅读历史';

-- 收藏分组（默认分组；用户可把收藏移动到自定义分组）
SET @has_folder := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'article_favorites' AND COLUMN_NAME = 'folder'
);
SET @ddl := IF(@has_folder = 0,
  'ALTER TABLE article_favorites ADD COLUMN folder VARCHAR(30) NOT NULL DEFAULT ''默认分组'' AFTER user_id',
  'SELECT ''folder already exists'' AS note');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 关注动态（内容管理分组下）
INSERT IGNORE INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (16, 2, '关注动态', '/content/feed', 'Bell', 25, NULL, 1);
