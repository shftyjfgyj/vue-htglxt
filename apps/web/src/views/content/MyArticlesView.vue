<template>
  <div class="page-container">
    <!-- 创作数据概览 -->
    <section class="stat-grid">
      <div class="stat-card">
        <span class="stat-label">全部文章</span>
        <strong class="stat-value">{{ stats.total }}</strong>
        <span class="stat-foot">回收站 {{ stats.recycled }} 篇</span>
      </div>
      <div class="stat-card stat-card--ok">
        <span class="stat-label">已发布</span>
        <strong class="stat-value">{{ stats.published }}</strong>
        <span class="stat-foot">累计浏览 {{ stats.views }}</span>
      </div>
      <div class="stat-card stat-card--brand">
        <span class="stat-label">草稿</span>
        <strong class="stat-value">{{ stats.draft }}</strong>
        <span class="stat-foot">待审核 {{ stats.pending }} 篇</span>
      </div>
      <div class="stat-card stat-card--warn">
        <span class="stat-label">互动数据</span>
        <strong class="stat-value">{{ stats.likes }}<i>赞</i></strong>
        <span class="stat-foot">收藏 {{ stats.favorites }} · 评论 {{ stats.comments }}</span>
      </div>
    </section>

    <el-card shadow="never">
      <template #header>
        <div class="mine-head">
          <div>
            <h2 class="mine-title">我的文章</h2>
            <p class="mine-sub">只展示你自己的内容；草稿箱、审核状态、互动数据都在这里</p>
          </div>
          <div class="mine-actions">
            <el-button
              :type="trashed ? 'warning' : 'default'"
              :icon="Delete"
              @click="onTrashedToggle"
            >
              回收站 {{ stats.recycled }}
            </el-button>
            <el-button :icon="Download" @click="onExport">导出</el-button>
            <el-button type="primary" :icon="EditPen" @click="goCreate">写文章</el-button>
          </div>
        </div>
      </template>

      <!-- 状态分栏 -->
      <div v-if="!trashed" class="status-bar">
        <button
          v-for="tab in statusTabs"
          :key="String(tab.value)"
          type="button"
          class="status-chip"
          :class="{ 'is-active': query.status === tab.value }"
          @click="onStatusChange(tab.value)"
        >
          {{ tab.label }}
          <em>{{ tab.count }}</em>
        </button>
      </div>
      <el-alert v-else type="warning" :closable="false" show-icon class="trash-tip">
        <template #title>这里是回收站：删除的文章会保留在这里，可随时恢复到草稿箱</template>
      </el-alert>

      <!-- 筛选 -->
      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="搜索标题 / 摘要 / 正文" clearable style="width: 240px" @keyup.enter="reload">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.categoryId" placeholder="全部分类" clearable style="width: 150px" @change="reload">
          <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="query.sortBy" style="width: 150px" @change="reload">
          <el-option label="按更新时间" value="updated" />
          <el-option label="按创建时间" value="created" />
          <el-option label="按浏览量" value="views" />
          <el-option label="按点赞数" value="likes" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <el-tag v-if="queryMemory.restored.value" size="small" type="info" closable @close="queryMemory.clearMemory()">已恢复上次筛选</el-tag>
      </div>

      <!-- 批量操作 -->
      <div v-if="selectedRows.length > 0" class="batch-bar">
        <span class="batch-count">已选 {{ selectedRows.length }} 篇</span>
        <template v-if="!trashed">
          <el-button size="small" @click="onBatch('submit')">批量提交审核</el-button>
          <el-button size="small" @click="onBatch('publish')">批量发布</el-button>
          <el-button size="small" @click="onBatch('offline')">批量下线</el-button>
        </template>
        <el-button size="small" type="danger" plain @click="onBatch('delete')">批量删除</el-button>
        <el-button size="small" link @click="clearSelection">取消选择</el-button>
      </div>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="rows"
        stripe
        empty-text="还没有文章，点右上角「写文章」开始创作"
        @selection-change="onSelectionChange"
      >
        <el-table-column type="selection" width="46" />
        <el-table-column label="文章" min-width="300">
          <template #default="{ row }">
            <div class="cell-title" @click="goEdit(row as ArticleItem)">{{ (row as ArticleItem).title }}</div>
            <div class="cell-sub">
              <span v-if="(row as ArticleItem).categoryName" class="sub-chip">{{ (row as ArticleItem).categoryName }}</span>
              <span class="sub-text">{{ (row as ArticleItem).tags || '未打标签' }}</span>
            </div>
            <div v-if="(row as ArticleItem).status === 3 && (row as ArticleItem).auditRemark" class="cell-remark">
              驳回原因：{{ (row as ArticleItem).auditRemark }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag((row as ArticleItem).status)" size="small">
              {{ statusText((row as ArticleItem).status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数据" width="180">
          <template #default="{ row }">
            <span class="metric">浏览 {{ (row as ArticleItem).viewCount }} · 赞 {{ (row as ArticleItem).likeCount }}</span>
            <span class="metric">收藏 {{ (row as ArticleItem).favoriteCount ?? 0 }} · 评论 {{ (row as ArticleItem).commentCount }}</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="120">
          <template #default="{ row }">
            <span class="sub-text">{{ String((row as ArticleItem).updatedAt).slice(0, 10) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="248" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <template v-if="trashed">
              <el-button link type="primary" size="small" @click="onRestore(row as ArticleItem)">恢复</el-button>
            </template>
            <template v-else>
              <el-button link type="primary" size="small" @click="goEdit(row as ArticleItem)">
                {{ (row as ArticleItem).status === 0 ? '继续编辑' : '编辑' }}
              </el-button>
              <el-button link size="small" @click="goRead(row as ArticleItem)">预览</el-button>
              <el-dropdown trigger="click" @command="(cmd: string) => onRowCommand(cmd, row as ArticleItem)">
                <el-button link type="primary" size="small">更多<el-icon><ArrowDown /></el-icon></el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-if="[0, 3, 4].includes((row as ArticleItem).status)" command="submit">提交审核</el-dropdown-item>
                    <el-dropdown-item v-if="[0, 1, 4].includes((row as ArticleItem).status)" command="publish">发布</el-dropdown-item>
                    <el-dropdown-item v-if="(row as ArticleItem).status === 2" command="offline">下线</el-dropdown-item>
                    <el-dropdown-item command="duplicate" divided>复制为新草稿</el-dropdown-item>
                    <el-dropdown-item command="delete">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus';
import { ArrowDown, Delete, Download, EditPen, Refresh, Search } from '@element-plus/icons-vue';
import * as articleApi from '@/api/article';
import * as categoryApi from '@/api/category';
import { downloadBlob } from '@/utils/download';
import { useQueryMemory } from '@/composables/useQueryMemory';
import type { ArticleItem, CategoryItem, MyArticleStats } from '@/types/content';

const router = useRouter();
const tableRef = ref<TableInstance>();
const loading = ref(false);
const trashed = ref(false);
const rows = ref<ArticleItem[]>([]);
const total = ref(0);
const selectedRows = ref<ArticleItem[]>([]);
const categories = ref<CategoryItem[]>([]);
const stats = ref<MyArticleStats>({
  total: 0, draft: 0, pending: 0, published: 0, rejected: 0, offline: 0,
  views: 0, likes: 0, favorites: 0, comments: 0, recycled: 0
});

const query = reactive<{ keyword: string; status: number | undefined; categoryId: number | undefined; sortBy: 'updated' | 'created' | 'views' | 'likes'; page: number; pageSize: number }>({
  keyword: '', status: undefined, categoryId: undefined, sortBy: 'updated', page: 1, pageSize: 10
});
const queryMemory = useQueryMemory('my-articles', query);

const statusTabs = computed(() => [
  { label: '全部', value: undefined as number | undefined, count: stats.value.total },
  { label: '草稿', value: 0, count: stats.value.draft },
  { label: '待审核', value: 1, count: stats.value.pending },
  { label: '已发布', value: 2, count: stats.value.published },
  { label: '已驳回', value: 3, count: stats.value.rejected },
  { label: '已下线', value: 4, count: stats.value.offline }
]);

function statusText(status: number) {
  return ['草稿', '待审核', '已发布', '已驳回', '已下线'][status] ?? '未知';
}

function statusTag(status: number) {
  if (status === 2) return 'success';
  if (status === 1) return 'warning';
  if (status === 3) return 'danger';
  if (status === 4) return 'info';
  return 'info';
}

async function loadStats() {
  try {
    stats.value = await articleApi.myArticleStats();
  } catch {
    // 统计失败不影响列表
  }
}

async function load() {
  loading.value = true;
  try {
    const result = await articleApi.listArticles({
      keyword: query.keyword || undefined,
      status: trashed.value ? undefined : query.status,
      categoryId: query.categoryId,
      sortBy: query.sortBy,
      onlyMine: true,
      trashed: trashed.value || undefined,
      page: query.page,
      pageSize: query.pageSize
    });
    rows.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function reload() {
  query.page = 1;
  void load();
}

function onReset() {
  query.keyword = '';
  query.status = undefined;
  query.categoryId = undefined;
  query.sortBy = 'updated';
  queryMemory.clearMemory();
  reload();
}

function onStatusChange(value: number | undefined) {
  query.status = value;
  reload();
}

function onTrashedToggle() {
  trashed.value = !trashed.value;
  clearSelection();
  query.status = undefined;
  reload();
  void loadStats();
}

function onSelectionChange(list: ArticleItem[]) {
  selectedRows.value = list;
}

function clearSelection() {
  tableRef.value?.clearSelection();
  selectedRows.value = [];
}

function goCreate() {
  void router.push('/content/articles/new');
}

function goEdit(row: ArticleItem) {
  void router.push('/content/articles/' + row.id + '/edit');
}

function goRead(row: ArticleItem) {
  void router.push('/content/articles/' + row.id + '/view');
}

async function refreshAll() {
  await Promise.all([load(), loadStats()]);
}

async function onRowCommand(command: string, row: ArticleItem) {
  if (command === 'submit') {
    await articleApi.submitArticle(row.id);
    ElMessage.success('已提交审核');
  } else if (command === 'publish') {
    await articleApi.publishArticle(row.id, true);
    ElMessage.success('已发布');
  } else if (command === 'offline') {
    await articleApi.publishArticle(row.id, false);
    ElMessage.success('已下线');
  } else if (command === 'duplicate') {
    const result = await articleApi.duplicateArticle(row.id);
    ElMessage.success('已复制为草稿');
    await refreshAll();
    void router.push('/content/articles/' + result.id + '/edit');
    return;
  } else if (command === 'delete') {
    await ElMessageBox.confirm('删除后可在「回收站」中恢复，确定删除《' + row.title + '》？', '提示', { type: 'warning' });
    await articleApi.deleteArticle(row.id);
    ElMessage.success('已移入回收站');
  }
  await refreshAll();
}

async function onBatch(action: 'submit' | 'publish' | 'offline' | 'delete') {
  const ids = selectedRows.value.map((row) => row.id);
  if (ids.length === 0) return;
  const labels = { submit: '提交审核', publish: '发布', offline: '下线', delete: '删除' } as const;
  await ElMessageBox.confirm('确定对选中的 ' + ids.length + ' 篇文章执行「' + labels[action] + '」？', '提示', { type: 'warning' });
  const result = await articleApi.batchOperate({ ids, action });
  ElMessage.success(
    '已处理 ' + result.affected + ' 篇' + (result.skipped ? '，跳过 ' + result.skipped + ' 篇' : '')
  );
  clearSelection();
  await refreshAll();
}

async function onRestore(row: ArticleItem) {
  await articleApi.restoreArticle(row.id);
  ElMessage.success('已恢复到草稿箱');
  await refreshAll();
}

async function onExport() {
  const blob = await articleApi.exportArticles({
    keyword: query.keyword || undefined,
    status: trashed.value ? undefined : query.status,
    categoryId: query.categoryId
  });
  downloadBlob(blob, 'my-articles-' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

onMounted(async () => {
  await Promise.all([
    loadStats(),
    load(),
    categoryApi.listCategories().then((data) => { categories.value = data; }).catch(() => undefined)
  ]);
});
</script>

<style scoped>
/* 数据概览 */
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
.stat-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 16px 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  position: relative;
  overflow: hidden;
}
.stat-card::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--ink-200); }
.stat-card--ok::after { background: var(--ok-500); }
.stat-card--brand::after { background: var(--brand-500); }
.stat-card--warn::after { background: var(--warn-500); }
.stat-label { font-size: 12.5px; color: var(--text-muted); }
.stat-value { font-size: 26px; font-weight: 700; color: var(--text-strong); letter-spacing: -0.5px; line-height: 1.2; }
.stat-value i { font-style: normal; font-size: 12px; font-weight: 500; color: var(--text-muted); margin-left: 3px; }
.stat-foot { font-size: 12px; color: var(--text-faint); }

.mine-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.mine-title { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-strong); }
.mine-sub { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); }
.mine-actions { display: flex; align-items: center; gap: 12px; }

/* 状态分栏 */
.status-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.status-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 5px 14px; border: 1px solid var(--line); border-radius: 999px;
  background: var(--surface); color: var(--text-body); font-size: 13px; font-family: inherit; cursor: pointer;
  transition: all 0.16s ease;
}
.status-chip:hover { border-color: var(--chip-brand-border); color: var(--chip-brand-text); background: var(--chip-brand-bg); }
.status-chip.is-active { background: linear-gradient(135deg, var(--brand-500), var(--brand-600)); color: #fff; border-color: transparent; font-weight: 600; }
.status-chip em { font-style: normal; font-size: 11.5px; opacity: 0.75; }
.trash-tip { margin-bottom: 14px; }

.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.batch-bar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 10px 14px; margin-bottom: 12px;
  border: 1px dashed var(--chip-brand-border);
  border-radius: var(--radius-md);
  background: var(--chip-brand-bg);
}
.batch-count { font-size: 13px; color: var(--chip-brand-text); font-weight: 600; }

.cell-title { font-weight: 600; color: var(--text-strong); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-title:hover { color: var(--brand-600); }
.cell-sub { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 12px; }
.sub-chip { flex: none; padding: 0 7px; border-radius: 999px; background: var(--chip-brand-bg); color: var(--chip-brand-text); border: 1px solid var(--chip-brand-border); font-size: 11.5px; }
.sub-text { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-remark { margin-top: 4px; font-size: 12px; color: var(--danger-600, #dc2626); }
.metric { display: block; color: var(--text-muted); font-size: 12px; }
:deep(.ops-cell) .cell { white-space: nowrap; }

@media (max-width: 1100px) {
  .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .stat-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
