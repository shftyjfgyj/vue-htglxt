-- =====================================================================
-- M11 自动审核：全站文章权限收敛 + 违禁词库 + 审核记录 + 用户信任度
-- 幂等：可重复执行
-- =====================================================================

-- ---------- 1) 权限 ----------
INSERT IGNORE INTO permissions (code, name, type, module, sort) VALUES
  ('article:manage',   '全站文章管理', 'menu',   'article',   27),
  ('sensitive:list',   '违禁词列表',   'menu',   'sensitive', 90),
  ('sensitive:create', '新增违禁词',   'button', 'sensitive', 91),
  ('sensitive:update', '编辑违禁词',   'button', 'sensitive', 92),
  ('sensitive:delete', '删除违禁词',   'button', 'sensitive', 93);

-- 管理员：全站文章管理 + 违禁词库
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('article:manage', 'sensitive:list', 'sensitive:create', 'sensitive:update', 'sensitive:delete')
WHERE r.code = 'admin';

-- 内容编辑：保留「全站文章」的查看与审核（菜单改挂 article:audit），
-- 但不再授予 article:manage —— 「改写/删除他人文章」收归 admin。
-- 幂等兜底：历史库若已授过，这里显式回收。
DELETE rp FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'editor' AND p.code = 'article:manage';

-- 只读访客：明确不给（历史数据兜底清理）
DELETE rp FROM role_permissions rp
  JOIN roles r ON r.id = rp.role_id
  JOIN permissions p ON p.id = rp.permission_id
WHERE r.code = 'viewer' AND p.code = 'article:manage';

-- ---------- 2) 菜单 ----------
-- 文章管理 → 全站文章：挂 article:audit（admin + editor 可见，viewer 不可见）。
-- 原先挂 article:manage，但那是「改写他人文章」的权限，不该由它决定菜单；
-- 挂 article:manage 会让 editor 在收回改写权后一并丢掉审核台入口。
UPDATE menus SET name = '全站文章', permission_code = 'article:audit', icon = 'Tickets', sort = 20 WHERE id = 3;
-- 我的文章紧随其后
UPDATE menus SET sort = 21 WHERE id = 17;
-- 违禁词库（系统管理分组）
INSERT IGNORE INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (18, 7, '违禁词库', '/system/sensitive-words', 'Warning', 35, 'sensitive:list', 1);

-- ---------- 3) 违禁词库 ----------
CREATE TABLE IF NOT EXISTS sensitive_words (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  word       VARCHAR(64) NOT NULL,
  category   VARCHAR(20) NOT NULL DEFAULT '其他',
  level      ENUM('block','review','replace') NOT NULL DEFAULT 'review',
  enabled    TINYINT(1) NOT NULL DEFAULT 1,
  remark     VARCHAR(200) NOT NULL DEFAULT '',
  hit_count  INT UNSIGNED NOT NULL DEFAULT 0,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_word (word),
  KEY idx_enabled_level (enabled, level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='违禁词库';

-- ---------- 4) 审核记录（机器 + 人工，便于追溯） ----------
CREATE TABLE IF NOT EXISTS audit_records (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_type   ENUM('article','comment') NOT NULL,
  target_id     INT UNSIGNED NOT NULL,
  decision      ENUM('auto_pass','auto_reject','to_review','manual_pass','manual_reject') NOT NULL,
  hit_words     VARCHAR(500) NOT NULL DEFAULT '',
  hit_level     VARCHAR(20) NOT NULL DEFAULT '',
  operator_type ENUM('system','user') NOT NULL DEFAULT 'system',
  operator_id   INT UNSIGNED NULL,
  remark        VARCHAR(255) NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_target (target_type, target_id),
  KEY idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='审核记录';

-- ---------- 5) 用户信任度 ----------
SET @has_auto_audit := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'auto_audit');
SET @ddl := IF(@has_auto_audit = 0,
  'ALTER TABLE users ADD COLUMN auto_audit TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''管理员强制信任''',
  'SELECT ''auto_audit exists'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_violation := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'violation_count');
SET @ddl := IF(@has_violation = 0,
  'ALTER TABLE users ADD COLUMN violation_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT ''违规次数''',
  'SELECT ''violation_count exists'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_last := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'last_violation_at');
SET @ddl := IF(@has_last = 0,
  'ALTER TABLE users ADD COLUMN last_violation_at DATETIME NULL COMMENT ''最近一次违规时间''',
  'SELECT ''last_violation_at exists'' AS note');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 6) 演示违禁词已移出：见 099_demo_seed.sql（仅在 SEED_DEMO=true 时执行）
