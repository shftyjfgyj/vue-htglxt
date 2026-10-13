<template>
  <div class="page-container">
    <el-card shadow="never">
      <template #header>
        <div class="head">
          <div>
            <h2 class="title">我的评论</h2>
            <p class="sub">这里只显示你自己发表的评论（含待审核与被拦截的），可以删除或跳回原文查看</p>
          </div>
          <div class="actions">
            <el-select v-model="query.auditStatus" placeholder="全部状态" clearable style="width: 140px" @change="reload">
              <el-option label="待审核" :value="0" />
              <el-option label="已通过" :value="1" />
              <el-option label="已拒绝" :value="2" />
            </el-select>
            <el-input v-model="query.keyword" placeholder="搜索评论内容" clearable style="width: 200px" @keyup.enter="reload">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
            <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
          </div>
        </div>
      </template>

      <el-table v-loading="loading" :data="rows" stripe empty-text="还没有发表过评论">
        <el-table-column label="评论内容" min-width="280">
          <template #default="{ row }">
            <div class="cell-content">{{ (row as CommentItem).content }}</div>
            <div v-if="(row as CommentItem).parentId" class="cell-reply">
              回复 {{ (row as CommentItem).parentUserName || '已删除用户' }}：{{ (row as CommentItem).parentContent || '原评论已删除' }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="所属文章" min-width="180">
          <template #default="{ row }">
            <el-button link type="primary" size="small" class="article-link" @click="goArticle(row as CommentItem)">
              {{ (row as CommentItem).articleTitle || '（文章已删除）' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="statusTag((row as CommentItem).auditStatus)" size="small">
              {{ statusText((row as CommentItem).auditStatus) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="机器判定" width="150">
          <template #default="{ row }">
            <span class="decision">{{ decisionText((row as CommentItem).auditDecision) }}</span>
            <div v-if="(row as CommentItem).auditHitWords" class="hit-words">命中：{{ (row as CommentItem).auditHitWords }}</div>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="115">
          <template #default="{ row }">
            <span class="time">{{ String((row as CommentItem).createdAt).slice(0, 10) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goArticle(row as CommentItem)">查看</el-button>
            <el-button link type="info" size="small" @click="openRecords(row as CommentItem)">审核记录</el-button>
            <el-button link type="danger" size="small" @click="onRemove(row as CommentItem)">删除</el-button>
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

    <el-drawer v-model="recordsVisible" title="审核记录" size="420px">
      <AuditTimeline :records="records" :loading="recordsLoading" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import AuditTimeline from '@/components/AuditTimeline.vue';
import * as api from '@/api/comment';
import type { AuditRecord, CommentItem } from '@/types/content';

const router = useRouter();
const loading = ref(false);
const rows = ref<CommentItem[]>([]);
const total = ref(0);
const recordsVisible = ref(false);
const recordsLoading = ref(false);
const records = ref<AuditRecord[]>([]);

const query = reactive<{ keyword: string; auditStatus: number | undefined; page: number; pageSize: number }>({
  keyword: '', auditStatus: undefined, page: 1, pageSize: 10
});

function statusText(status: number) {
  return ['待审核', '已通过', '已拒绝'][status] ?? '未知';
}

function statusTag(status: number) {
  return status === 1 ? 'success' : status === 2 ? 'danger' : 'warning';
}

function decisionText(decision?: string | null) {
  if (!decision) return '—';
  const map: Record<string, string> = {
    auto_pass: '自动通过',
    auto_reject: '自动拦截',
    to_review: '转人工',
    manual_pass: '人工通过',
    manual_reject: '人工拒绝'
  };
  return map[decision] ?? decision;
}

async function load() {
  loading.value = true;
  try {
    // 后端会按权限强制只返回本人评论
    const result = await api.listComments({
      keyword: query.keyword || undefined,
      auditStatus: query.auditStatus,
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

function goArticle(row: CommentItem) {
  if (!row.articleId) return;
  void router.push({ path: '/content/articles/' + row.articleId + '/view', hash: '#comment-' + row.id });
}

async function onRemove(row: CommentItem) {
  await ElMessageBox.confirm('确定删除这条评论？', '提示', { type: 'warning' });
  await api.removeComment(row.id);
  ElMessage.success('已删除');
  await load();
}

async function openRecords(row: CommentItem) {
  recordsVisible.value = true;
  recordsLoading.value = true;
  try {
    records.value = await api.commentAuditRecords(row.id);
  } finally {
    recordsLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.title { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-strong); }
.sub { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); }
.actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cell-content { font-size: 14px; color: var(--text-strong); line-height: 1.5; }
.cell-reply { margin-top: 4px; font-size: 12px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.article-link { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; justify-content: flex-start; }
.decision { font-size: 12.5px; color: var(--text-body); }
.hit-words { font-size: 11.5px; color: #dc2626; margin-top: 2px; }
.time { font-size: 12.5px; color: var(--text-muted); }
:deep(.ops-cell) .cell { white-space: nowrap; }
</style>
