-- =====================================================================
-- M8 互动增强：文章收藏 + 我的收藏菜单
-- 幂等：可重复执行
-- =====================================================================

CREATE TABLE IF NOT EXISTS article_favorites (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  article_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_article_favorite (article_id, user_id),
  KEY idx_favorite_user (user_id, created_at),
  CONSTRAINT fk_favorite_article FOREIGN KEY (article_id) REFERENCES articles (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='文章收藏';

-- articles.favorite_count 冗余计数（MySQL 5.7 没有 ADD COLUMN IF NOT EXISTS）
SET @has_favorite_count := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'articles' AND COLUMN_NAME = 'favorite_count'
);
SET @ddl := IF(@has_favorite_count = 0,
  'ALTER TABLE articles ADD COLUMN favorite_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER comment_count',
  'SELECT ''favorite_count already exists'' AS note');
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 个人中心：我的收藏（所有登录用户可见）
INSERT IGNORE INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (15, 12, '我的收藏', '/profile/library', 'Star', 43, NULL, 1);
