<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="lib-head">
          <div>
            <h2 class="lib-title">我的内容库</h2>
            <p class="lib-sub">收藏、点赞与最近看过的文章都在这里</p>
          </div>
          <el-radio-group v-model="kind" @change="onKindChange">
            <el-radio-button value="favorites">我的收藏</el-radio-button>
            <el-radio-button value="likes">我的点赞</el-radio-button>
            <el-radio-button value="history">最近在看</el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <!-- 收藏分组筛选 -->
      <div v-if="kind === 'favorites' && folders.length" class="folder-bar">
        <button
          type="button"
          class="folder-chip"
          :class="{ 'is-active': activeFolder === '全部' }"
          @click="onFolderChange('全部')"
        >
          全部 <em>{{ kindTotal }}</em>
        </button>
        <button
          v-for="item in folders"
          :key="item.folder"
          type="button"
          class="folder-chip"
          :class="{ 'is-active': activeFolder === item.folder }"
          @click="onFolderChange(item.folder)"
        >
          {{ item.folder }} <em>{{ item.total }}</em>
        </button>
      </div>

      <el-table v-loading="loading" :data="rows" stripe empty-text="还没有内容，去文章列表逛逛吧">
        <el-table-column label="文章" min-width="280">
          <template #default="{ row }">
            <div class="cell-title" @click="goRead(row as LibraryArticle)">{{ (row as LibraryArticle).title }}</div>
            <div class="cell-sub">
              <span v-if="(row as LibraryArticle).categoryName" class="sub-chip">{{ (row as LibraryArticle).categoryName }}</span>
              <span v-if="(row as LibraryArticle).tags" class="sub-text">{{ (row as LibraryArticle).tags }}</span>
              <span v-else class="sub-text">未打标签</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="authorName" label="作者" width="110" />
        <el-table-column v-if="kind === 'favorites'" label="分组" width="130">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ (row as LibraryArticle).folder || '默认分组' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="96">
          <template #default="{ row }">
            <el-tag :type="statusTag((row as LibraryArticle).status)" size="small">{{ statusText((row as LibraryArticle).status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数据" width="170">
          <template #default="{ row }">
            <span class="metric">浏览 {{ (row as LibraryArticle).viewCount }} · 赞 {{ (row as LibraryArticle).likeCount }}</span>
            <span class="metric">收藏 {{ (row as LibraryArticle).favoriteCount }} · 评论 {{ (row as LibraryArticle).commentCount }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="timeLabel" width="120">
          <template #default="{ row }">
            <span class="sub-text">{{ String((row as LibraryArticle).markedAt).slice(0, 10) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goRead(row as LibraryArticle)">阅读</el-button>
            <el-button v-if="kind === 'favorites'" link type="info" size="small" @click="openMoveFolder(row as LibraryArticle)">移动分组</el-button>
            <el-button v-if="kind === 'favorites'" link type="warning" size="small" @click="onRemoveFavorite(row as LibraryArticle)">取消收藏</el-button>
            <el-button v-else-if="kind === 'likes'" link type="warning" size="small" @click="onRemoveLike(row as LibraryArticle)">取消点赞</el-button>
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

    <el-dialog v-model="folderVisible" title="移动到分组" width="420px">
      <el-form label-width="70px" @submit.prevent>
        <el-form-item label="分组">
          <el-select
            v-model="folderName"
            filterable
            allow-create
            default-first-option
            placeholder="选择或输入新分组名"
            style="width: 100%"
          >
            <el-option v-for="item in folders" :key="item.folder" :label="item.folder" :value="item.folder" />
            <el-option label="默认分组" value="默认分组" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="folderVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onMoveFolderSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import * as interactionApi from '@/api/interaction';
import type { LibraryArticle } from '@/types/content';

type LibraryKind = 'favorites' | 'likes' | 'history';

const router = useRouter();
const kind = ref<LibraryKind>('favorites');
const loading = ref(false);
const saving = ref(false);
const rows = ref<LibraryArticle[]>([]);
const total = ref(0);
const query = reactive({ page: 1, pageSize: 10 });

const folders = ref<Array<{ folder: string; total: number }>>([]);
const activeFolder = ref('全部');

const folderVisible = ref(false);
const folderName = ref('默认分组');
const folderTarget = ref<LibraryArticle | null>(null);

const kindTotal = computed(() => folders.value.reduce((sum, item) => sum + item.total, 0));
const timeLabel = computed(() =>
  kind.value === 'favorites' ? '收藏时间' : kind.value === 'likes' ? '点赞时间' : '最近阅读'
);

function statusText(status: number) {
  return ['草稿', '待审核', '已发布', '已驳回', '已下线'][status] ?? '未知';
}

function statusTag(status: number) {
  if (status === 2) return 'success';
  if (status === 1) return 'warning';
  if (status === 3) return 'danger';
  return 'info';
}

async function loadFolders() {
  try {
    folders.value = await interactionApi.favoriteFolders();
  } catch {
    folders.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const params = { page: query.page, pageSize: query.pageSize };
    const result =
      kind.value === 'favorites'
        ? await interactionApi.myFavorites({ ...params, folder: activeFolder.value === '全部' ? undefined : activeFolder.value })
        : kind.value === 'likes'
          ? await interactionApi.myLikes(params)
          : await interactionApi.myHistory(params);
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

async function onKindChange() {
  activeFolder.value = '全部';
  reload();
  if (kind.value === 'favorites') await loadFolders();
}

function onFolderChange(folder: string) {
  activeFolder.value = folder;
  reload();
}

function goRead(row: LibraryArticle) {
  void router.push('/content/articles/' + row.id + '/view');
}

async function onRemoveFavorite(row: LibraryArticle) {
  await interactionApi.unfavoriteArticle(row.id);
  ElMessage.success('已取消收藏');
  await Promise.all([load(), loadFolders()]);
}

async function onRemoveLike(row: LibraryArticle) {
  await interactionApi.unlikeArticle(row.id);
  ElMessage.success('已取消点赞');
  await load();
}

function openMoveFolder(row: LibraryArticle) {
  folderTarget.value = row;
  folderName.value = row.folder || '默认分组';
  folderVisible.value = true;
}

async function onMoveFolderSubmit() {
  if (!folderTarget.value) return;
  if (!folderName.value.trim()) {
    ElMessage.warning('请输入分组名称');
    return;
  }
  saving.value = true;
  try {
    await interactionApi.moveFavoriteFolder(folderTarget.value.id, folderName.value.trim());
    ElMessage.success('已移动到「' + folderName.value.trim() + '」');
    folderVisible.value = false;
    await Promise.all([loadFolders(), load()]);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadFolders()]);
});
</script>

<style scoped>
.lib-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.lib-title { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-strong); }
.lib-sub { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); }

/* 收藏分组筛选条 */
.folder-bar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.folder-chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-body);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.16s ease;
}
.folder-chip:hover { border-color: var(--chip-brand-border); color: var(--chip-brand-text); background: var(--chip-brand-bg); }
.folder-chip.is-active { background: linear-gradient(135deg, var(--brand-500), var(--brand-600)); color: #fff; border-color: transparent; }
.folder-chip em { font-style: normal; opacity: 0.7; font-size: 11.5px; }

.cell-title { font-weight: 600; color: var(--text-strong); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cell-title:hover { color: var(--brand-600); }
.cell-sub { display: flex; align-items: center; gap: 6px; margin-top: 3px; font-size: 12px; }
.sub-chip { flex: none; padding: 0 7px; border-radius: 999px; background: var(--chip-brand-bg); color: var(--chip-brand-text); border: 1px solid var(--chip-brand-border); font-size: 11.5px; }
.sub-text { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.metric { display: block; color: var(--text-muted); font-size: 12px; }
:deep(.ops-cell) .cell { white-space: nowrap; }
</style>
