<template>
  <div class="page-container">
    <el-card shadow="never" class="page-card">
      <div class="table-toolbar">
        <el-input v-model="query.keyword" placeholder="标题 / 摘要 / 正文" clearable style="width: 200px" @keyup.enter="reload" />
        <el-checkbox v-model="query.fulltext" title="使用 MySQL ngram 全文索引，正文也可命中">全文检索</el-checkbox>
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
          <el-option v-for="item in STATUS_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="query.categoryId" placeholder="分类" clearable style="width: 140px">
          <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-select v-model="query.tagId" placeholder="标签" clearable style="width: 140px">
          <el-option v-for="item in tags" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <el-checkbox v-if="isContentManager" v-model="query.onlyMine">只看我的</el-checkbox>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
      </div>

      <!-- 审核队列提示：自动审核上线后，人工只需要处理机器拿不准的 -->
      <div v-if="pendingCount > 0" class="queue-bar">
        <el-icon><Bell /></el-icon>
        <span>当前有 <b>{{ pendingCount }}</b> 篇待人工审核（自动审核已处理其余内容）</span>
        <el-button size="small" type="primary" plain @click="onlyPending">只看待审核</el-button>
      </div>

      <div class="table-toolbar">
        <el-button v-permission="'article:create'" type="success" :icon="Plus" @click="goCreate">写文章</el-button>
        <el-checkbox v-model="onlySelected" :disabled="selected.length === 0">仅显示已选（{{ selected.length }}）</el-checkbox>
        <el-divider direction="vertical" />
        <el-dropdown :disabled="selected.length === 0" @command="onBatchCommand">
          <el-button :disabled="selected.length === 0">批量操作<el-icon><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="submit" :disabled="!can('article:update')">批量提交审核</el-dropdown-item>
              <el-dropdown-item command="publish" :disabled="!can('article:publish')">批量发布</el-dropdown-item>
              <el-dropdown-item command="offline" :disabled="!can('article:publish')">批量下线</el-dropdown-item>
              <el-dropdown-item command="category" :disabled="!can('article:update')">批量改分类</el-dropdown-item>
              <el-dropdown-item command="addTags" :disabled="!can('article:update')">批量打标签</el-dropdown-item>
              <el-dropdown-item command="delete" divided :disabled="!can('article:delete')">批量删除</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-divider direction="vertical" />
        <el-button v-permission="'article:list'" :icon="Download" :loading="exporting" @click="onExport">导出 Excel</el-button>
        <el-upload v-if="can('article:create')" :show-file-list="false" :before-upload="onImport" accept=".xlsx,.csv">
          <el-button :icon="Upload" :loading="importing">导入 Excel</el-button>
        </el-upload>
        <el-button v-if="can('article:create')" link type="primary" @click="onDownloadTemplate">下载导入模板</el-button>
        <el-button v-if="cols.isCustomized.value" link type="info" title="清除记忆的列宽" @click="cols.reset()">重置列宽</el-button>
        <el-tag v-if="queryMemory.restored.value" size="small" type="info" closable @close="queryMemory.clearMemory()">已恢复上次筛选</el-tag>
      </div>

      <el-table
        ref="tableRef"
        v-loading="loading"
        :data="displayRows"
        row-key="id"
        border
        stripe
        @selection-change="onSelectionChange"
        @header-dragend="cols.onHeaderDragend"
      >
        <el-table-column type="selection" width="46" reserve-selection />
        <el-table-column v-bind="cols.colProps('ID')" prop="id" label="ID" />
        <el-table-column v-bind="cols.colProps('标题')" label="标题">
          <template #default="{ row }">
            <div class="cell-row">
              <!-- 封面缩略图：没有封面时用分类首字占位，避免出现空框 -->
              <div class="cell-thumb" :class="{ 'is-empty': !(row as ArticleItem).coverImg }">
                <img v-if="(row as ArticleItem).coverImg" :src="(row as ArticleItem).coverImg" alt="" loading="lazy" />
                <span v-else>{{ ((row as ArticleItem).categoryName || '未').slice(0, 1) }}</span>
              </div>
              <div class="cell-text">
                <div class="cell-title" :title="(row as ArticleItem).title">{{ (row as ArticleItem).title }}</div>
                <div class="cell-sub">
                  <span v-if="(row as ArticleItem).categoryName" class="sub-chip">{{ (row as ArticleItem).categoryName }}</span>
                  <span v-if="(row as ArticleItem).tags" class="sub-text">{{ (row as ArticleItem).tags }}</span>
                  <span v-else class="sub-text sub-text--muted">未打标签</span>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-bind="cols.colProps('作者')" prop="authorName" label="作者" />
        <el-table-column v-bind="cols.colProps('状态')" label="状态">
          <template #default="{ row }">
            <el-tag :type="statusTagType((row as ArticleItem).status)" size="small">{{ statusText((row as ArticleItem).status) }}</el-tag>
            <div class="cell-sub sub-text--muted">浏览 {{ (row as ArticleItem).viewCount }} · 赞 {{ (row as ArticleItem).likeCount }}</div>
          </template>
        </el-table-column>
        <el-table-column v-bind="cols.colProps('机器判定')" label="机器判定" width="170">
          <template #default="{ row }">
            <span class="decision-text">{{ decisionText((row as ArticleItem).auditDecision) }}</span>
            <div v-if="(row as ArticleItem).auditHitWords" class="hit-text">命中：{{ (row as ArticleItem).auditHitWords }}</div>
          </template>
        </el-table-column>
        <el-table-column v-bind="cols.colProps('更新时间')" label="更新时间">
          <template #default="{ row }">
            <span class="sub-text">{{ String((row as ArticleItem).updatedAt).slice(0, 10) }}</span>
          </template>
        </el-table-column>
        <el-table-column v-bind="cols.colProps('操作')" label="操作" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goView(row as ArticleItem)">阅读</el-button>
            <el-button link type="info" size="small" @click="openRecords(row as ArticleItem)">记录</el-button>
            <el-button v-if="canEditArticle(row as ArticleItem)" link type="primary" size="small" @click="goEdit(row as ArticleItem)">编辑</el-button>
            <el-button
              v-permission="'article:audit'"
              link
              type="success"
              size="small"
              :disabled="(row as ArticleItem).status !== 1"
              @click="openAudit(row as ArticleItem)"
            >审核</el-button>
            <el-dropdown trigger="click" @command="(command: string) => onRowCommand(command, row as ArticleItem)">
              <el-button link type="info" size="small" class="more-btn">
                更多<el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    v-if="canEditArticle(row as ArticleItem)"
                    command="submit"
                    :disabled="(row as ArticleItem).status !== 0 && (row as ArticleItem).status !== 3"
                  >提交审核</el-dropdown-item>
                  <el-dropdown-item
                    v-permission="'article:publish'"
                    command="publish"
                    :disabled="(row as ArticleItem).status !== 4"
                  >发布</el-dropdown-item>
                  <el-dropdown-item
                    v-permission="'article:publish'"
                    command="offline"
                    :disabled="(row as ArticleItem).status !== 2"
                  >下线</el-dropdown-item>
                  <el-dropdown-item v-if="canDeleteArticle(row as ArticleItem)" command="delete" divided>删除</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </el-card>

    <el-dialog v-model="auditVisible" :title="'审核文章 #' + auditRow?.id" width="480px">
      <p class="dialog-title">{{ auditRow?.title }}</p>
      <el-radio-group v-model="auditForm.approved">
        <el-radio :value="true">通过并发布</el-radio>
        <el-radio :value="false">驳回</el-radio>
      </el-radio-group>
      <el-input v-model="auditForm.remark" type="textarea" :rows="3" placeholder="审核意见（驳回时建议填写，会通知作者）" style="margin-top: 12px" />
      <template #footer>
        <el-button @click="auditVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onAuditSubmit">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchCategoryVisible" title="批量修改分类" width="420px">
      <el-select v-model="batchCategoryId" placeholder="选择目标分类" clearable style="width: 100%">
        <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <template #footer>
        <el-button @click="batchCategoryVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onBatchCategory">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchTagVisible" title="批量打标签" width="420px">
      <el-select v-model="batchTagIds" multiple placeholder="选择要添加的标签" style="width: 100%">
        <el-option v-for="item in tags" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
      <template #footer>
        <el-button @click="batchTagVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onBatchTags">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type TableInstance } from 'element-plus';
import { ArrowDown, Bell, Download, Plus, Refresh, Search, Upload } from '@element-plus/icons-vue';
import * as articleApi from '@/api/article';
import * as categoryApi from '@/api/category';
import * as dashboardApi from '@/api/dashboard';
import * as tagApi from '@/api/tag';
import { useTableColumns } from '@/composables/useTableColumns';
import { useUserStore } from '@/stores/user';
import type { ArticleItem, AuditRecord, CategoryItem, TagItem } from '@/types/content';
import AuditTimeline from '@/components/AuditTimeline.vue';
import { useQueryMemory } from '@/composables/useQueryMemory';

const STATUS_OPTIONS = [
  { value: 0, label: '草稿' },
  { value: 1, label: '待审核' },
  { value: 2, label: '已发布' },
  { value: 3, label: '已驳回' },
  { value: 4, label: '已下线' }
];

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
const exporting = ref(false);
const importing = ref(false);
const rows = ref<ArticleItem[]>([]);
const pendingCount = ref(0);
const recordsVisible = ref(false);
const recordsLoading = ref(false);
const records = ref<AuditRecord[]>([]);
const total = ref(0);
const categories = ref<CategoryItem[]>([]);
const tags = ref<TagItem[]>([]);
const tableRef = ref<TableInstance>();

/** 列宽可拖拽并记忆（存 localStorage，刷新后保持） */
const cols = useTableColumns('articles', {
  ID: { width: 66 },
  标题: { minWidth: 320 },
  作者: { width: 96 },
  状态: { width: 112 },
  更新时间: { width: 112 },
  操作: { width: 228 }
});
const selected = ref<ArticleItem[]>([]);
const onlySelected = ref(false);

const query = reactive<{ keyword: string; fulltext: boolean; status: number | undefined; categoryId: number | undefined; tagId: number | undefined; onlyMine: boolean; page: number; pageSize: number }>({
  keyword: '', fulltext: false, status: undefined, categoryId: undefined, tagId: undefined, onlyMine: false, page: 1, pageSize: 10
});
/** 记住上次筛选条件（sessionStorage），切页返回后自动恢复 */
const queryMemory = useQueryMemory('articles', query);


const isContentManager = computed(() => userStore.hasPermission('article:audit'));
const displayRows = computed(() => (onlySelected.value ? selected.value : rows.value));

function can(code: string) {
  return userStore.hasPermission(code);
}

/**
 * 「全站文章」列表里混着别人的稿子：改写类操作必须看归属。
 * 只有本人文章，或持有 article:manage（改写他人文章，默认仅 admin）才放行——
 * 审核人（article:audit）保留查看与审核，但不再能替作者改稿、删稿。
 */
function isMine(row: ArticleItem) {
  return row.authorId === userStore.user?.id;
}

function canEditArticle(row: ArticleItem) {
  return can('article:update') && (isMine(row) || can('article:manage'));
}

function canDeleteArticle(row: ArticleItem) {
  return can('article:delete') && (isMine(row) || can('article:manage'));
}

function statusText(status: number) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? '未知';
}

function statusTagType(status: number) {
  if (status === 2) return 'success';
  if (status === 1) return 'warning';
  if (status === 3) return 'danger';
  if (status === 4) return 'info';
  return undefined;
}

function decisionText(decision?: string | null) {
  if (!decision) return '—';
  const map: Record<string, string> = {
    auto_pass: '自动通过',
    auto_reject: '自动驳回',
    to_review: '转人工',
    manual_pass: '人工通过',
    manual_reject: '人工驳回'
  };
  return map[decision] ?? decision;
}

/** 只看待审核：把状态筛选切到待审核并重新查询 */
function onlyPending() {
  query.status = 1;
  query.page = 1;
  void load();
}

async function loadPendingCount() {
  try {
    const overview = await dashboardApi.fetchOverview();
    pendingCount.value = overview.articles?.pending ?? 0;
  } catch {
    pendingCount.value = 0;
  }
}

async function openRecords(row: ArticleItem) {
  recordsVisible.value = true;
  recordsLoading.value = true;
  try {
    records.value = await articleApi.articleAuditRecords(row.id);
  } finally {
    recordsLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const result = await articleApi.listArticles({
      keyword: query.keyword || undefined,
      fulltext: query.fulltext || undefined,
      status: query.status,
      categoryId: query.categoryId,
      tagId: query.tagId,
      onlyMine: isContentManager.value ? query.onlyMine : undefined,
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
  query.fulltext = false;
  query.status = undefined;
  query.categoryId = undefined;
  query.tagId = undefined;
  query.onlyMine = false;
  reload();
}

function onSelectionChange(rowsSelected: ArticleItem[]) {
  selected.value = rowsSelected;
  if (rowsSelected.length === 0) onlySelected.value = false;
}

function goCreate() {
  void router.push('/content/articles/new');
}

function goEdit(row: ArticleItem) {
  void router.push('/content/articles/' + row.id + '/edit');
}

function goView(row: ArticleItem) {
  void router.push('/content/articles/' + row.id + '/view');
}

async function onSubmit(row: ArticleItem) {
  await ElMessageBox.confirm('提交后进入待审核状态，期间不可编辑。确定提交？', '提示', { type: 'warning' });
  await articleApi.submitArticle(row.id);
  ElMessage.success('已提交审核');
  await load();
}

const auditVisible = ref(false);
const auditRow = ref<ArticleItem | null>(null);
const auditForm = reactive<{ approved: boolean; remark: string }>({ approved: true, remark: '' });

function openAudit(row: ArticleItem) {
  auditRow.value = row;
  auditForm.approved = true;
  auditForm.remark = '';
  auditVisible.value = true;
}

async function onAuditSubmit() {
  if (!auditRow.value) return;
  submitting.value = true;
  try {
    await articleApi.auditArticle(auditRow.value.id, { approved: auditForm.approved, remark: auditForm.remark });
    ElMessage.success(auditForm.approved ? '审核通过并发布（已通知作者）' : '已驳回（已通知作者）');
    auditVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

/** 行内「更多」下拉的统一入口 */
async function onRowCommand(command: string, row: ArticleItem) {
  if (command === 'submit') return onSubmit(row);
  if (command === 'delete') return onRemove(row);
  if (command === 'publish') {
    await articleApi.publishArticle(row.id, true);
    ElMessage.success('已发布');
    return load();
  }
  if (command === 'offline') {
    await articleApi.publishArticle(row.id, false);
    ElMessage.success('已下线');
    return load();
  }
  return undefined;
}

async function onTogglePublish(row: ArticleItem) {
  const publish = row.status !== 2;
  await articleApi.publishArticle(row.id, publish);
  ElMessage.success(publish ? '已发布' : '已下线');
  await load();
}

async function onRemove(row: ArticleItem) {
  await ElMessageBox.confirm('确定删除文章「' + row.title + '」吗？（软删除，可在数据库恢复）', '警告', { type: 'warning' });
  await articleApi.deleteArticle(row.id);
  ElMessage.success('已删除');
  await load();
}

// ---------------- 批量操作 ----------------
const batchCategoryVisible = ref(false);
const batchCategoryId = ref<number | null>(null);
const batchTagVisible = ref(false);
const batchTagIds = ref<number[]>([]);

function selectedIds() {
  return selected.value.map((item) => item.id);
}

async function runBatch(action: 'submit' | 'publish' | 'offline' | 'delete', payload: Record<string, unknown> = {}) {
  const result = await articleApi.batchOperate({ ids: selectedIds(), action, ...payload });
  const failed = result.errors.length ? '；失败 ' + result.errors.length + ' 条（' + result.errors[0]!.reason + '）' : '';
  ElMessage.success('成功 ' + result.affected + ' 条，跳过 ' + result.skipped + ' 条' + failed);
  tableRef.value?.clearSelection();
  await load();
}

async function onBatchCommand(command: string) {
  if (selected.value.length === 0) return;
  submitGuard(command);
  if (command === 'delete') {
    await ElMessageBox.confirm('确定批量删除选中的 ' + selected.value.length + ' 篇文章吗？', '警告', { type: 'warning' });
    await runBatch('delete');
    return;
  }
  if (command === 'category') {
    batchCategoryId.value = null;
    batchCategoryVisible.value = true;
    return;
  }
  if (command === 'addTags') {
    batchTagIds.value = [];
    batchTagVisible.value = true;
    return;
  }
  await runBatch(command as 'submit' | 'publish' | 'offline');
}

function submitGuard(command: string) {
  if (command === 'submit') ElMessage.info('正在提交 ' + selected.value.length + ' 篇文章进入审核队列…');
}

async function onBatchCategory() {
  submitting.value = true;
  try {
    await runBatch('category' as never, { categoryId: batchCategoryId.value });
    batchCategoryVisible.value = false;
  } finally {
    submitting.value = false;
  }
}

async function onBatchTags() {
  submitting.value = true;
  try {
    await runBatch('addTags' as never, { tagIds: batchTagIds.value });
    batchTagVisible.value = false;
  } finally {
    submitting.value = false;
  }
}

// ---------------- 导入导出 ----------------
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function onExport() {
  exporting.value = true;
  try {
    const blob = await articleApi.exportArticles({ keyword: query.keyword || undefined, status: query.status, categoryId: query.categoryId });
    downloadBlob(blob, 'articles-' + new Date().toISOString().slice(0, 10) + '.xlsx');
    ElMessage.success('导出成功（最多 5000 条）');
  } finally {
    exporting.value = false;
  }
}

async function onDownloadTemplate() {
  const blob = await articleApi.downloadImportTemplate();
  downloadBlob(blob, 'article-import-template.xlsx');
}

async function onImport(file: File) {
  importing.value = true;
  try {
    const result = await articleApi.importArticles(file);
    const detail = result.errors.length ? '；首个问题：第 ' + result.errors[0]!.row + ' 行 ' + result.errors[0]!.reason : '';
    ElMessage.success('导入完成：新增 ' + result.created + ' 篇，跳过 ' + result.skipped + ' 篇' + detail);
    await load();
  } finally {
    importing.value = false;
  }
  return false;
}

onMounted(async () => {
  await Promise.all([
    load(),
    loadPendingCount(),
    categoryApi.listCategories().then((data) => { categories.value = data; }).catch(() => undefined),
    tagApi.listTags().then((data) => { tags.value = data; }).catch(() => undefined)
  ]);
});
</script>

<style scoped>
.dialog-title { font-weight: 600; margin: 0 0 12px; }

/* 审核队列提示条。模板里一直有这个 class，但全仓库没有任何样式定义，
   于是它退化成一行裸 inline 文本：容器高 24.5px、按钮高 24px，
   提示文字和按钮挤在一起，按钮还带着全局的品牌投影浮在筛选区上方。 */
.queue-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 2px 0 14px;
  padding: 8px 12px;
  border: 1px solid var(--chip-brand-border);
  border-radius: var(--radius-md);
  background: var(--chip-brand-bg);
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-body);
}
.queue-bar > .el-icon { flex: none; color: var(--brand-500); font-size: 15px; }
.queue-bar > span { flex: 1 1 auto; }
.queue-bar > span b { color: var(--brand-700); font-weight: 600; }
.queue-bar > .el-button { flex: none; }

/* 标题 + 分类/标签 的两行单元格，比多列更省宽度也更耐看 */
.cell-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
/* 封面缩略图：固定小尺寸，必须限死宽高，否则 img 会按原始尺寸（1536×1024）撑爆单元格 */
.cell-thumb {
  width: 52px;
  height: 36px;
  flex: none;
  border-radius: 6px;
  overflow: hidden;
  background: var(--chip-bg);
  border: 1px solid var(--line-soft);
  display: grid;
  place-items: center;
}
.cell-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cell-thumb.is-empty { font-size: 13px; font-weight: 600; color: var(--text-faint); }
.cell-text { flex: 1; min-width: 0; }
.cell-title {
  font-weight: 600;
  color: var(--text-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-sub { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 12px; line-height: 1.4; }
.cell-sub.sub-text--muted,
.sub-text { color: var(--text-muted); }
.sub-chip {
  flex: none;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--chip-brand-bg);
  color: var(--chip-brand-text);
  border: 1px solid var(--chip-brand-border);
  font-size: 11.5px;
}
.sub-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 操作列：不换行，避免行高忽高忽低 */
:deep(.ops-cell) .cell { white-space: nowrap; }
.more-btn { display: inline-flex; align-items: center; gap: 2px; }
.more-btn :deep(.el-icon) { margin-left: 2px; }
</style>