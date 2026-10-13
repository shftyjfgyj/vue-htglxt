<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="table-toolbar">
        <el-input v-model="query.keyword" placeholder="评论内容关键词" clearable style="width: 200px" @keyup.enter="reload" />
        <el-input v-model="query.articleId" placeholder="文章 ID" clearable style="width: 130px" @keyup.enter="reload" />
        <el-select v-model="query.auditStatus" placeholder="审核状态" clearable style="width: 140px">
          <el-option label="待审核" :value="0" />
          <el-option label="已通过" :value="1" />
          <el-option label="已拒绝" :value="2" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-tag v-if="queryMemory.restored.value" size="small" type="info" closable @close="queryMemory.clearMemory()">已恢复上次筛选</el-tag>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="56" />
        <el-table-column label="文章" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">
            <el-button link type="primary" size="small" class="article-link" @click="goComment(row as CommentItem)">
              {{ (row as CommentItem).articleTitle || '（文章已删除）' }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column prop="userName" label="评论人" width="88" />
        <el-table-column label="回复关系" width="190">
          <template #default="{ row }">
            <div v-if="(row as CommentItem).parentId" class="reply-cell">
              <span class="reply-to">
                <el-icon><ChatLineSquare /></el-icon>
                回复 {{ (row as CommentItem).parentUserName || '已删除用户' }}
              </span>
              <span class="reply-quote">「{{ (row as CommentItem).parentContent || '原评论已删除' }}」</span>
            </div>
            <el-tag v-else size="small" type="info" effect="plain">顶层评论</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="content" label="内容" min-width="150" show-overflow-tooltip />
        <el-table-column label="状态" width="84">
          <template #default="{ row }">
            <el-tag :type="(row as CommentItem).auditStatus === 1 ? 'success' : (row as CommentItem).auditStatus === 2 ? 'danger' : 'warning'" size="small">
              {{ ['待审核', '已通过', '已拒绝'][(row as CommentItem).auditStatus] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="96">
          <template #default="{ row }">
            <span class="time-cell">{{ String((row as CommentItem).createdAt).slice(0, 10) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="机器判定" width="150">
          <template #default="{ row }">
            <span class="decision-text">{{ decisionText((row as CommentItem).auditDecision) }}</span>
            <div v-if="(row as CommentItem).auditHitWords" class="hit-text">命中：{{ (row as CommentItem).auditHitWords }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="252" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="goComment(row as CommentItem)">查看</el-button>
            <el-button link type="info" size="small" @click="openRecords(row as CommentItem)">记录</el-button>
            <el-button v-permission="'comment:audit'" link type="success" size="small" @click="onAudit(row as CommentItem, 1)">通过</el-button>
            <el-button v-permission="'comment:audit'" link type="warning" size="small" @click="onAudit(row as CommentItem, 2)">拒绝</el-button>
            <el-button v-permission="'comment:delete'" link type="danger" size="small" @click="onRemove(row as CommentItem)">删除</el-button>
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
import { ChatLineSquare, Refresh, Search } from '@element-plus/icons-vue';
import * as api from '@/api/comment';
import type { AuditRecord, CommentItem } from '@/types/content';
import { useQueryMemory } from '@/composables/useQueryMemory';
import AuditTimeline from '@/components/AuditTimeline.vue';

const router = useRouter();
const loading = ref(false);
const rows = ref<CommentItem[]>([]);
const recordsVisible = ref(false);
const recordsLoading = ref(false);
const records = ref<AuditRecord[]>([]);
const total = ref(0);
const query = reactive<{ keyword: string; articleId: string; auditStatus: number | undefined; page: number; pageSize: number }>({
  keyword: '', articleId: '', auditStatus: undefined, page: 1, pageSize: 10
});
/** 记住上次筛选条件（sessionStorage），切页返回后自动恢复 */
const queryMemory = useQueryMemory('comments', query);


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

async function openRecords(row: CommentItem) {
  recordsVisible.value = true;
  recordsLoading.value = true;
  try {
    records.value = await api.commentAuditRecords(row.id);
  } finally {
    recordsLoading.value = false;
  }
}

async function load() {
  loading.value = true;
  try {
    const result = await api.listComments({
      keyword: query.keyword || undefined,
      articleId: query.articleId ? Number(query.articleId) : undefined,
      auditStatus: query.auditStatus,
      page: query.page,
      pageSize: query.pageSize
    });
    rows.value = result.list;
    total.value = result.total;
  } finally { loading.value = false; }
}

function reload() { query.page = 1; void load(); }

/** 跳转到文章阅读页，并定位到这条评论（#comment-<id>） */
function goComment(row: CommentItem) {
  if (!row.articleId) return;
  void router.push({ path: '/content/articles/' + row.articleId + '/view', hash: '#comment-' + row.id });
}

async function onAudit(row: CommentItem, auditStatus: number) {
  await api.auditComment(row.id, auditStatus);
  ElMessage.success(auditStatus === 1 ? '已通过' : '已拒绝');
  await load();
}

async function onRemove(row: CommentItem) {
  await ElMessageBox.confirm('确定删除该评论吗？', '警告', { type: 'warning' });
  await api.removeComment(row.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(load);
</script>

<style scoped>
/* 回复关系：作者 + 被回复内容摘要，一眼看清上下文 */
.reply-cell { display: flex; flex-direction: column; gap: 2px; line-height: 1.4; }
.time-cell { font-size: 12.5px; color: var(--text-muted); }
.article-link { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; justify-content: flex-start; }
:deep(.ops-cell) .cell { white-space: nowrap; }
.decision-text { font-size: 12.5px; color: var(--text-body); }
.hit-text { font-size: 11.5px; color: #dc2626; margin-top: 2px; }
.reply-to { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; color: var(--warn-700); font-weight: 500; }
.reply-quote {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-left: 2px solid var(--line);
  padding-left: 6px;
}
</style>
