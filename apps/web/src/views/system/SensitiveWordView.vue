<template>
  <div class="page-container">
    <!-- 概览 -->
    <section class="stat-grid">
      <div class="stat-card stat-card--brand">
        <span class="stat-label">词条总数</span>
        <strong class="stat-value">{{ stats.total }}</strong>
        <span class="stat-foot">启用后立即生效（缓存 60 秒内自动刷新）</span>
      </div>
      <div class="stat-card stat-card--danger">
        <span class="stat-label">自动驳回词</span>
        <strong class="stat-value">{{ levelCount('block') }}</strong>
        <span class="stat-foot">命中即驳回，谨慎添加</span>
      </div>
      <div class="stat-card stat-card--warn">
        <span class="stat-label">转人工词</span>
        <strong class="stat-value">{{ levelCount('review') }}</strong>
        <span class="stat-foot">命中后进入人工审核队列</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">命中排行</span>
        <strong class="stat-value">{{ stats.topHits[0] ? stats.topHits[0].word : '—' }}</strong>
        <span class="stat-foot">{{ stats.topHits[0] ? '命中 ' + stats.topHits[0].hits + ' 次' : '暂无命中记录' }}</span>
      </div>
    </section>

    <el-card shadow="never">
      <template #header>
        <div class="lib-head">
          <div>
            <h2 class="lib-title">违禁词库</h2>
            <p class="lib-sub">文章与评论提交时会自动扫描：命中 block 直接驳回，命中 review 转人工，未命中则由可信作者直接发布</p>
          </div>
          <div class="lib-actions">
            <el-button :icon="MagicStick" @click="testVisible = true">命中测试</el-button>
            <el-button :icon="Upload" @click="importVisible = true">批量导入</el-button>
            <el-button type="primary" :icon="Plus" @click="openCreate">新增词条</el-button>
          </div>
        </div>
      </template>

      <div class="filter-bar">
        <el-input v-model="query.keyword" placeholder="搜索违禁词" clearable style="width: 200px" @keyup.enter="reload">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="query.category" placeholder="全部分类" clearable style="width: 140px" @change="reload">
          <el-option v-for="item in categories" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="query.level" placeholder="全部级别" clearable style="width: 150px" @change="reload">
          <el-option label="自动驳回（block）" value="block" />
          <el-option label="转人工（review）" value="review" />
          <el-option label="仅提示（replace）" value="replace" />
        </el-select>
        <el-select v-model="query.enabled" placeholder="全部状态" clearable style="width: 130px" @change="reload">
          <el-option label="已启用" value="1" />
          <el-option label="已停用" value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" stripe empty-text="词库还是空的，先加几个词或用「批量导入」">
        <el-table-column label="违禁词" min-width="150">
          <template #default="{ row }">
            <span class="word-text">{{ (row as SensitiveWord).word }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="plain">{{ (row as SensitiveWord).category }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="140">
          <template #default="{ row }">
            <el-tag :type="levelTag((row as SensitiveWord).level)" size="small">{{ levelText((row as SensitiveWord).level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="90">
          <template #default="{ row }">
            <el-switch
              :model-value="(row as SensitiveWord).enabled === 1"
              @change="(value: string | number | boolean) => onToggle(row as SensitiveWord, value === true)"
            />
          </template>
        </el-table-column>
        <el-table-column prop="hitCount" label="命中次数" width="100" />
        <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
        <el-table-column label="操作" width="140" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEdit(row as SensitiveWord)">编辑</el-button>
            <el-button link type="danger" size="small" @click="onRemove(row as SensitiveWord)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="load"
          @size-change="reload"
        />
      </div>
    </el-card>

    <!-- 新增 / 编辑 -->
    <el-dialog v-model="formVisible" :title="form.id ? '编辑词条' : '新增词条'" width="480px">
      <el-form ref="formRef" :model="form" :rules="formRules" label-width="80px">
        <el-form-item label="违禁词" prop="word">
          <el-input v-model="form.word" placeholder="要拦截的词，例如：加微信" maxlength="64" />
        </el-form-item>
        <el-form-item label="分类">
          <el-select v-model="form.category" filterable allow-create default-first-option placeholder="选择或输入分类" style="width: 100%">
            <el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item" />
          </el-select>
        </el-form-item>
        <el-form-item label="级别">
          <el-radio-group v-model="form.level">
            <el-radio-button value="review">转人工</el-radio-button>
            <el-radio-button value="block">自动驳回</el-radio-button>
            <el-radio-button value="replace">仅提示</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" placeholder="选填，例如：发票类违法广告" maxlength="200" />
        </el-form-item>
        <el-alert type="warning" :closable="false" show-icon>
          <template #title>级别为「自动驳回」的词命中后，文章会被直接驳回并通知作者，请确保词义明确</template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="formVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 -->
    <el-dialog v-model="importVisible" title="批量导入违禁词" width="560px">
      <el-alert type="info" :closable="false" show-icon class="mb">
        <template #title>一行一个词，可选「词,分类,级别」，例如：加微信,广告,review；已有词会自动跳过</template>
      </el-alert>
      <el-input v-model="importText" type="textarea" :rows="10" placeholder="加微信,广告,review&#10;代开发票,违法,block&#10;办证" />
      <div class="import-row">
        <el-select v-model="importCategory" filterable allow-create default-first-option placeholder="默认分类" style="width: 160px">
          <el-option v-for="item in categoryOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-select v-model="importLevel" placeholder="默认级别" style="width: 170px">
          <el-option label="转人工（推荐）" value="review" />
          <el-option label="自动驳回" value="block" />
          <el-option label="仅提示" value="replace" />
        </el-select>
        <span class="import-hint">未写分类/级别的行使用这里的默认值</span>
      </div>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" @click="onImport">开始导入</el-button>
      </template>
    </el-dialog>

    <!-- 命中测试 -->
    <el-dialog v-model="testVisible" title="命中测试" width="620px">
      <el-input
        v-model="testText"
        type="textarea"
        :rows="6"
        placeholder="粘贴一段文章或评论内容，看看会自动审核成什么结果"
      />
      <div class="test-actions">
        <el-button type="primary" :loading="testing" @click="onTest">测试一下</el-button>
        <span class="test-hint">不会写库、不会影响任何数据</span>
      </div>
      <div v-if="testResult" class="test-result">
        <el-alert
          :type="testResult.decision === 'pass' ? 'success' : testResult.decision === 'review' ? 'warning' : 'error'"
          :closable="false"
          show-icon
        >
          <template #title>{{ testResult.summary }}</template>
        </el-alert>
        <div v-if="testResult.hits.length" class="test-hits">
          <span class="test-hits-label">命中明细：</span>
          <el-tag
            v-for="hit in testResult.hits"
            :key="hit.id"
            :type="hit.level === 'block' ? 'danger' : hit.level === 'review' ? 'warning' : 'info'"
            size="small"
          >
            {{ hit.word }}（{{ hit.category }} · {{ levelText(hit.level) }}）
          </el-tag>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { MagicStick, Plus, Refresh, Search, Upload } from '@element-plus/icons-vue';
import * as api from '@/api/sensitive';
import type { SensitiveWord, WordLevel, WordStats, WordTestResult } from '@/api/sensitive';

const loading = ref(false);
const saving = ref(false);
const importing = ref(false);
const testing = ref(false);
const rows = ref<SensitiveWord[]>([]);
const total = ref(0);
const categories = ref<string[]>([]);
const stats = ref<WordStats>({ total: 0, byLevel: [], byCategory: [], topHits: [] });

const query = reactive<{ keyword: string; category: string | undefined; level: WordLevel | undefined; enabled: '0' | '1' | undefined; page: number; pageSize: number }>({
  keyword: '', category: undefined, level: undefined, enabled: undefined, page: 1, pageSize: 20
});

const formVisible = ref(false);
const formRef = ref<FormInstance>();
const form = reactive<{ id: number | null; word: string; category: string; level: WordLevel; remark: string }>({
  id: null, word: '', category: '其他', level: 'review', remark: ''
});
const formRules: FormRules = { word: [{ required: true, message: '请输入违禁词', trigger: 'blur' }] };

const importVisible = ref(false);
const importText = ref('');
const importCategory = ref('其他');
const importLevel = ref<WordLevel>('review');

const testVisible = ref(false);
const testText = ref('');
const testResult = ref<WordTestResult | null>(null);

const categoryOptions = computed(() => {
  const set = new Set(['政治', '色情', '广告', '辱骂', '违法', '其他', ...categories.value]);
  return [...set];
});

function levelCount(level: string) {
  return stats.value.byLevel.find((item) => item.level === level)?.count ?? 0;
}

function levelText(level: string) {
  return level === 'block' ? '自动驳回' : level === 'review' ? '转人工' : '仅提示';
}

function levelTag(level: string) {
  return level === 'block' ? 'danger' : level === 'review' ? 'warning' : 'info';
}

async function loadStats() {
  try {
    stats.value = await api.wordStats();
  } catch {
    /* 忽略 */
  }
}

async function loadCategories() {
  try {
    categories.value = await api.wordCategories();
  } catch {
    categories.value = [];
  }
}

async function load() {
  loading.value = true;
  try {
    const result = await api.listWords({
      keyword: query.keyword || undefined,
      category: query.category,
      level: query.level,
      enabled: query.enabled,
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
  query.category = undefined;
  query.level = undefined;
  query.enabled = undefined;
  reload();
}

function openCreate() {
  form.id = null;
  form.word = '';
  form.category = '其他';
  form.level = 'review';
  form.remark = '';
  formVisible.value = true;
}

function openEdit(row: SensitiveWord) {
  form.id = row.id;
  form.word = row.word;
  form.category = row.category;
  form.level = row.level;
  form.remark = row.remark;
  formVisible.value = true;
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    if (form.id) {
      await api.updateWord(form.id, { word: form.word, category: form.category, level: form.level, remark: form.remark });
      ElMessage.success('已更新');
    } else {
      await api.createWord({ word: form.word, category: form.category, level: form.level, remark: form.remark });
      ElMessage.success('已加入词库，立即生效');
    }
    formVisible.value = false;
    await Promise.all([load(), loadStats(), loadCategories()]);
  } finally {
    saving.value = false;
  }
}

async function onToggle(row: SensitiveWord, enabled: boolean) {
  await api.updateWord(row.id, { enabled });
  ElMessage.success(enabled ? '已启用' : '已停用');
  await load();
}

async function onRemove(row: SensitiveWord) {
  await ElMessageBox.confirm('确定删除违禁词「' + row.word + '」？删除后立即不再拦截。', '提示', { type: 'warning' });
  await api.deleteWord(row.id);
  ElMessage.success('已删除');
  await Promise.all([load(), loadStats(), loadCategories()]);
}

async function onImport() {
  if (!importText.value.trim()) {
    ElMessage.warning('请先粘贴要导入的词');
    return;
  }
  importing.value = true;
  try {
    const result = await api.importWords({
      words: importText.value,
      category: importCategory.value || undefined,
      level: importLevel.value
    });
    ElMessage.success('导入完成：新增 ' + result.added + ' 个，跳过 ' + result.skipped + ' 个');
    importVisible.value = false;
    importText.value = '';
    await Promise.all([load(), loadStats(), loadCategories()]);
  } finally {
    importing.value = false;
  }
}

async function onTest() {
  if (!testText.value.trim()) {
    ElMessage.warning('请先粘贴一段文字');
    return;
  }
  testing.value = true;
  try {
    testResult.value = await api.testWords(testText.value);
  } finally {
    testing.value = false;
  }
}

onMounted(async () => {
  await Promise.all([load(), loadStats(), loadCategories()]);
});
</script>

<style scoped>
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
.stat-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 16px 18px; background: var(--surface);
  border: 1px solid var(--line); border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm); position: relative; overflow: hidden;
}
.stat-card::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--ink-200); }
.stat-card--brand::after { background: var(--brand-500); }
.stat-card--danger::after { background: #ef4444; }
.stat-card--warn::after { background: var(--warn-500); }
.stat-label { font-size: 12.5px; color: var(--text-muted); }
.stat-value { font-size: 24px; font-weight: 700; color: var(--text-strong); letter-spacing: -0.5px; line-height: 1.25; }
.stat-foot { font-size: 12px; color: var(--text-faint); }

.lib-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.lib-title { margin: 0; font-size: 16px; font-weight: 650; color: var(--text-strong); }
.lib-sub { margin: 4px 0 0; font-size: 12.5px; color: var(--text-muted); max-width: 720px; }
.lib-actions { display: flex; align-items: center; gap: 10px; }
.filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.word-text { font-weight: 600; color: var(--text-strong); }
.mb { margin-bottom: 12px; }
.import-row { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
.import-hint { font-size: 12px; color: var(--text-muted); }
.test-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
.test-hint { font-size: 12px; color: var(--text-faint); }
.test-result { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
.test-hits { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.test-hits-label { font-size: 12.5px; color: var(--text-muted); }
:deep(.ops-cell) .cell { white-space: nowrap; }

@media (max-width: 1100px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
