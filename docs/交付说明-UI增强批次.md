# 交付说明 · UI 增强批次（移动端 / ECharts / 筛选记忆 / PDF 报表）

## 1. 移动端适配

| 项 | 做法 |
| --- | --- |
| 断点 | `max-width: 900px`（`stores/app.ts` 用 `matchMedia` 监听，跨断点自动收起侧栏） |
| 侧栏 | 桌面为常驻侧栏；移动端改为 `el-drawer` 抽屉（248px，无标题栏，深色底） |
| 菜单复用 | 菜单抽成 `components/SidebarMenu.vue`，桌面与抽屉共用同一份渲染逻辑 |
| 交互 | 点击汉堡打开抽屉；**点击菜单项后抽屉自动关闭**；抽屉默认展开当前页所在分组 |
| 顶栏 | 移动端隐藏面包屑，改显示当前页标题；隐藏用户角色文字，仅留头像 |
| 内容 | `.page-container` 内边距与水卡片内边距在窄屏收紧；统计卡改单列 |

## 2. ECharts 多维趋势

- 后端 `GET /api/v1/dashboard/trend?days=N` 由「单维发文数」升级为**三维**：`{ day, total(发文), comments(评论), logins(登录成功) }`；仍返回数组，既有断言与调用方无需改动。
- 前端新增 `components/TrendChart.vue`：柱（发文，品牌渐变）+ 实线（评论）+ 虚线（登录成功），带图例、坐标轴提示与自适应。
- **按需引入**：`echarts/core` + `BarChart/LineChart/Grid/Tooltip/Legend/CanvasRenderer`，并**异步加载**（独立 chunk 503 kB / gzip 169 kB，不进首屏；主包仍 ~99 kB gzip）。
- **主题联动**：图表颜色从 CSS 变量读取，切换深/浅色时自动重绘。

## 3. 列表筛选条件记忆

- 新增 `composables/useQueryMemory.ts`：
  - 存 **sessionStorage**（同一标签页内切菜单返回仍是上次条件；关标签页即失效，不会长期误导）
  - 默认不记忆 `page`（页码可能越界），只记关键词/状态/分类/标签等
  - 300ms 防抖写入；恢复后在工具栏显示「已恢复上次筛选」并提供一键清除
- 已接入：文章列表、用户列表、评论管理、操作日志、登录日志。

## 4. PDF 数据报表

- 后端 `GET /api/v1/dashboard/report.pdf?days=N`（权限 `dashboard:view`），用 PDFKit 生成 A4 报表：顶部品牌色条、概览 8 项指标、近 N 天三维趋势表、热门文章 Top 10、页脚页码。
- **中文字体解析顺序**：环境变量 `PDF_FONT_PATH` → Windows `simhei.ttf` / `msyh.ttc` → Linux Noto CJK / 文泉驿。找不到字体时直接报错，**绝不生成乱码 PDF**。
- 实测：本机自动命中 `simhei.ttf`，产出 17.5 KB、1 页、内嵌 `SimHei`（FontFile2）的合法 PDF。
- 前端看板卡片头部新增「导出 PDF 报表」按钮（二进制流 + `downloadBlob` 工具，文件名 `htglxt-report-YYYY-MM-DD.pdf`）。

## 5. 验证（全部真实执行）

```
后端 typecheck : tsc --noEmit -> 0 error
前端 typecheck : vue-tsc --noEmit -> 0 error
前端构建       : vite build 成功；主包 gzip 99.3 kB，ECharts 独立 chunk 169 kB（异步）
浏览器 E2E     : 20/20 通过（Playwright + Edge），新增 4 条：
  · 导出 PDF：点击按钮捕获 download，校验文件名与 %PDF- 文件头
  · ECharts：canvas 可见且尺寸非零、echarts 实例已挂载、三维统计文案可读
  · 筛选记忆：填关键词查询 → 切到看板 → 返回文章列表，关键词仍在且有「已恢复上次筛选」提示
  · 移动端：420x860 视口下桌面侧栏消失、汉堡打开抽屉、点菜单跳转并自动关闭抽屉
接口冒烟       : M2/M3/M4/M5 共 120 项全绿（趋势字段为向后兼容扩展）
```

## 6. 环境变量补充

| 变量 | 说明 |
| --- | --- |
| `PDF_FONT_PATH` | PDF 报表使用的中文字体文件（可选；不设则按内置顺序查找系统字体） |
| `PDF_FONT_FAMILY` | 当字体是 .ttc 字体集时需要指定 family，如 `Microsoft YaHei` |
