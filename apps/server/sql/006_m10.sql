-- =====================================================================
-- M10 创作中心：我的文章菜单
-- 幂等：可重复执行
-- =====================================================================

INSERT IGNORE INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (17, 2, '我的文章', '/content/my-articles', 'EditPen', 26, NULL, 1);
