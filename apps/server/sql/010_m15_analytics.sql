-- =====================================================================
-- M15 运营分析页：审核效能 / 标签共现图谱 / 兴趣画像 / 作者排行
-- 幂等：可重复执行
-- =====================================================================

-- 顶级菜单「运营分析」，排在「数据看板」之后
-- 权限沿用 dashboard:view：页面本身人人可见，但内部的「审核效能」接口
-- 额外要求 article:audit / comment:audit（服务端把关，前端也会隐藏该分区）。
INSERT INTO menus (id, parent_id, name, path, icon, sort, permission_code, visible) VALUES
  (20, NULL, '运营分析', '/analytics', 'DataAnalysis', 15, 'dashboard:view', 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name), path = VALUES(path), icon = VALUES(icon),
  sort = VALUES(sort), permission_code = VALUES(permission_code), visible = VALUES(visible),
  deleted_at = NULL;
