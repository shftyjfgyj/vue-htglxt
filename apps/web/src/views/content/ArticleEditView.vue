<template>
  <div class="editor-page">
    <!-- 吸顶操作条：主操作永远在手边 -->
    <header class="editor-bar">
      <div class="bar-left">
        <button class="back-btn" type="button" title="返回列表" @click="goBack">
          <el-icon><ArrowLeft /></el-icon>
        </button>
        <div class="bar-title">
          <h1>{{ isEdit ? '编辑文章' : '写文章' }}</h1>
          <div class="bar-sub">
            <el-tag v-if="detail" :type="statusTagType(detail.status)" size="small">{{ statusText(detail.status) }}</el-tag>
            <span v-if="detail?.auditRemark" class="bar-remark bar-remark--warn">审核意见：{{ detail.auditRemark }}</span>
            <span v-else class="bar-remark">{{ isEdit ? '最近更新 ' + (detail?.updatedAt ?? '') : '新文章将先保存为草稿' }}</span>
          </div>
        </div>
      </div>

      <div class="bar-actions">
        <el-button v-if="isEdit" :icon="Document" @click="openRecords">审核记录</el-button>
        <el-button v-if="isEdit" :icon="Clock" @click="openVersions">
          版本历史（{{ detail?.versionCount ?? 0 }}）
        </el-button>
        <el-button :loading="saving" @click="onSave(false)">保存草稿</el-button>
        <el-button type="primary" :loading="saving" @click="onSave(true)">保存并提交审核</el-button>
      </div>
    </header>

    <div class="editor-body">
      <!-- 左：稿纸 -->
      <section class="doc-card">
        <el-form ref="formRef" :model="form" :rules="rules" class="doc-form" @submit.prevent>
          <el-form-item prop="title" class="title-item">
            <el-input v-model="form.title" placeholder="请输入标题" maxlength="200" class="doc-title" />
          </el-form-item>

          <el-form-item prop="summary" class="summary-item">
            <el-input
              v-model="form.summary"
              type="textarea"
              :rows="2"
              maxlength="500"
              placeholder="选填，用于列表展示"
              class="doc-summary"
            />
          </el-form-item>

          <el-divider class="doc-divider" />

          <el-form-item prop="content" class="content-item">
            <RichEditor v-model="form.content" />
          </el-form-item>
        </el-form>
      </section>

      <!-- 右：发布设置 -->
      <aside class="settings">
        <div class="panel">
          <h3 class="panel-title">发布设置</h3>
          <div class="field">
            <label>分类</label>
            <el-select v-model="form.categoryId" placeholder="选择分类" clearable style="width: 100%">
              <el-option v-for="item in categories" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </div>
          <div class="field">
            <label>标签</label>
            <el-select v-model="form.tagIds" multiple placeholder="选择标签" style="width: 100%">
              <el-option v-for="item in tags" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </div>
        </div>

        <!-- 质量体检：边写边算，直接说清「这篇还能怎么改好」 -->
        <div class="panel panel--quality">
          <h3 class="panel-title">
            质量体检
            <span v-if="quality" class="q-grade" :class="'q-grade--' + gradeTone">{{ quality.grade }}</span>
          </h3>

          <div v-if="quality" class="q-head">
            <div class="q-ring" :style="ringStyle">
              <div class="q-ring-inner">
                <span class="q-score">{{ quality.score }}</span>
                <span class="q-unit">分</span>
              </div>
            </div>
            <ul class="q-dims">
              <li v-for="item in quality.items" :key="item.key" class="q-dim">
                <span class="q-dim-label">{{ item.label }}</span>
                <span class="q-track">
                  <i :class="'q-fill--' + item.status" :style="{ width: Math.round((item.score / item.max) * 100) + '%' }" />
                </span>
              </li>
            </ul>
          </div>

          <template v-if="quality">
            <p class="q-hint" :class="{ 'q-hint--good': suggestions.length === 0 }">
              {{ suggestions.length ? '还有 ' + suggestions.length + ' 项可以改进' : '各方面都挺完整，可以发了' }}
            </p>
            <ul v-if="suggestions.length" class="q-tips">
              <li v-for="item in suggestions" :key="item.key" class="q-tip" :class="'q-tip--' + item.status">
                <b>{{ item.label }}</b>{{ item.tip }}
              </li>
            </ul>
          </template>
          <el-skeleton v-else :rows="3" animated />
        </div>

        <div class="panel">
          <h3 class="panel-title">封面图</h3>
          <el-upload
            :show-file-list="false"
            :before-upload="onCoverUpload"
            accept="image/*"
            class="cover-upload"
          >
            <div v-if="form.coverImg" class="cover-preview">
              <img :src="form.coverImg" alt="封面" />
              <div class="cover-mask">更换封面</div>
            </div>
            <div v-else class="cover-empty" :class="{ 'is-loading': uploadingCover }">
              <el-icon><Plus /></el-icon>
              <strong>{{ uploadingCover ? '上传中…' : '上传封面' }}</strong>
              <em>jpg / png / gif / webp，≤ 2MB</em>
            </div>
          </el-upload>
          <el-button v-if="form.coverImg" link type="danger" size="small" class="cover-remove" @click="form.coverImg = ''">
            移除封面
          </el-button>
        </div>

        <div class="panel">
          <h3 class="panel-title">发布流程</h3>
          <ol class="flow">
            <li><span class="flow-dot flow-dot--1" />保存草稿：仅自己可见</li>
            <li><span class="flow-dot flow-dot--2" />提交审核：进入待审核，期间不可编辑</li>
            <li><span class="flow-dot flow-dot--3" />审核通过：自动发布上线</li>
            <li><span class="flow-dot flow-dot--4" />编辑已保存文章：旧内容自动存为历史版本</li>
          </ol>
        </div>

        <div class="panel panel--stat">
          <span>正文 <b>{{ wordCount }}</b> 字</span>
          <span>标签 <b>{{ form.tagIds.length }}</b> 个</span>
          <span>封面 <b>{{ form.coverImg ? '已设置' : '未设置' }}</b></span>
        </div>
      </aside>
    </div>

    <!-- 版本历史 -->
    <el-drawer v-model="versionVisible" title="历史版本" size="680px">
      <el-table :data="versions" @selection-change="onVersionSelectionChange">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="version" label="版本" width="80" />
        <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
        <el-table-column prop="createdByName" label="操作人" width="100" />
        <el-table-column prop="createdAt" label="时间" width="165" />
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="viewVersion(row as ArticleVersion)">查看</el-button>
            <el-button v-permission="'article:update'" link type="warning" size="small" @click="restore(row as ArticleVersion)">恢复</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="version-actions">
        <el-button :disabled="selectedVersions.length !== 2" type="primary" @click="openDiff">对比选中的两个版本</el-button>
        <span class="hint">勾选两个版本后点击对比（行级 diff）</span>
      </div>
    </el-drawer>

    <el-dialog v-model="versionDetailVisible" :title="'版本 v' + versionDetail?.version" width="720px">
      <h3>{{ versionDetail?.title }}</h3>
      <div class="version-content" v-html="versionDetail?.content" />
      <template #footer>
        <el-button @click="versionDetailVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="diffVisible" title="版本对比" width="900px">
      <div v-if="diff">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>
            v{{ diff.from.version }} → v{{ diff.to.version }}：新增 {{ diff.content.added }} 行，删除 {{ diff.content.removed }} 行
            <span v-if="diff.content.truncated">（文本过长，仅对比前 600 行）</span>
          </template>
        </el-alert>
        <div class="diff-body">
          <div v-for="(line, index) in diff.content.lines" :key="index" :class="['diff-line', 'diff-' + line.type]">
            <span class="diff-no">{{ line.leftNo ?? '' }}</span>
            <span class="diff-no">{{ line.rightNo ?? '' }}</span>
            <span class="diff-text">{{ line.text || ' ' }}</span>
          </div>
        </div>
      </div>
    </el-dialog>

    <el-drawer v-model="recordsVisible" title="审核记录（机器 + 人工）" size="440px">
      <AuditTimeline :records="records" :loading="recordsLoading" />
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowLeft, Clock, Document, Plus } from '@element-plus/icons-vue';
import RichEditor from '@/components/RichEditor.vue';
import AuditTimeline from '@/components/AuditTimeline.vue';
import * as articleApi from '@/api/article';
import * as categoryApi from '@/api/category';
import * as tagApi from '@/api/tag';
import { uploadImage } from '@/api/upload';
import type { ArticleDetail, ArticleVersion, AuditRecord, CategoryItem, DiffResult, QualityReport, TagItem } from '@/types/content';

const route = useRoute();
const router = useRouter();

const articleId = computed(() => Number(route.params.id ?? 0));
const isEdit = computed(() => articleId.value > 0);

const formRef = ref<FormInstance>();
const saving = ref(false);
const uploadingCover = ref(false);
const categories = ref<CategoryItem[]>([]);
const tags = ref<TagItem[]>([]);
const detail = ref<ArticleDetail | null>(null);

const form = reactive<{ title: string; summary: string; content: string; coverImg: string; categoryId: number | null; tagIds: number[] }>({
  title: '', summary: '', content: '', coverImg: '', categoryId: null, tagIds: []
});

const rules: FormRules = {
  title: [{ required: true, min: 2, message: '标题至少 2 个字', trigger: 'blur' }],
  content: [
    {
      validator: (_rule, value, callback) => {
        const text = String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
        if (text.length === 0) callback(new Error('正文不能为空'));
        else callback();
      },
      trigger: 'blur'
    }
  ]
};

/**
 * 质量体检：由服务端打分（评分口径只有一份，见 article.quality.ts），
 * 这里只做防抖与展示。写稿时不希望因为体检请求失败而被打断，所以失败就静默保留上一次结果。
 */
const quality = ref<QualityReport | null>(null);
let qualityTimer: ReturnType<typeof setTimeout> | undefined;

/** 只把「还没做到满分」的项作为建议，避免一屏都是已完成的维度 */
const suggestions = computed(() => quality.value?.items.filter((item) => item.status !== 'good') ?? []);

const gradeTone = computed(() => {
  const score = quality.value?.score ?? 0;
  if (score >= 90) return 'good';
  if (score >= 60) return 'ok';
  return 'bad';
});

/** 分数环：用 conic-gradient 画进度，颜色随分数变化 */
const ringStyle = computed(() => {
  const score = quality.value?.score ?? 0;
  const color = score >= 90 ? 'var(--ok-500)' : score >= 75 ? 'var(--brand-500)' : score >= 60 ? 'var(--warn-500)' : 'var(--danger-500)';
  return { background: 'conic-gradient(' + color + ' ' + score + '%, var(--line-soft) 0)' };
});

async function refreshQuality() {
  try {
    quality.value = await articleApi.previewQuality({
      title: form.title,
      summary: form.summary,
      content: form.content,
      coverImg: form.coverImg,
      categoryId: form.categoryId,
      tagIds: form.tagIds
    });
  } catch {
    // 体检是辅助信息，失败不影响写作
  }
}

// 边写边算：400ms 防抖，避免每次按键都打接口
watch(
  form,
  () => {
    clearTimeout(qualityTimer);
    qualityTimer = setTimeout(refreshQuality, 400);
  },
  { deep: true }
);

onBeforeUnmount(() => clearTimeout(qualityTimer));

/** 正文字数（去掉 HTML 标签后统计，中文按字符、英文按词粗略估算） */
const wordCount = computed(() => {
  const text = form.content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  if (!text) return 0;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const words = (text.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) ?? []).length;
  return cjk + words;
});

function statusText(status: number) {
  return ['草稿', '待审核', '已发布', '已驳回', '已下线'][status] ?? '未知';
}

function statusTagType(status: number) {
  return status === 2 ? 'success' : status === 1 ? 'warning' : status === 3 ? 'danger' : status === 4 ? 'info' : undefined;
}

function goBack() {
  void router.push('/content/articles');
}

async function loadDetail() {
  if (!isEdit.value) return;
  const data = await articleApi.getArticle(articleId.value);
  // 直接敲 URL 也要拦：能不能编辑由服务端在详情里判定（canEdit），
  // 不依赖本地权限缓存——快照过期时也不会让人白填一通再在保存时吃 403。
  if (data.canEdit === false) {
    ElMessage.error('只能编辑自己的文章');
    void router.replace('/403');
    return;
  }
  detail.value = data;
  // 详情已带质量报告，先渲染出来，避免刚进页面时面板空着
  if (data.quality) quality.value = data.quality;
  form.title = data.title;
  form.summary = data.summary;
  form.content = data.content ?? '';
  form.coverImg = data.coverImg;
  form.categoryId = data.categoryId;
  form.tagIds = Array.isArray(data.tags) ? data.tags.map((tag) => tag.id) : [];
}

/** 提交后的自动审核结论：通过的直接说发布，驳回的把命中词告诉作者 */
function notifyVerdict(verdict: { decision?: 'pass' | 'reject' | 'review'; reason?: string; hits?: string[] }) {
  if (verdict.decision === 'pass') {
    ElMessage.success('未命中违禁词，已自动发布上线');
  } else if (verdict.decision === 'reject') {
    ElMessage.error('被自动驳回：' + (verdict.reason ?? '命中违禁词'));
  } else {
    ElMessage.success('已提交，等待人工审核');
  }
}

async function onSave(submit: boolean) {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    if (isEdit.value) {
      await articleApi.updateArticle(articleId.value, { ...form });
      if (submit) {
        const verdict = await articleApi.submitArticle(articleId.value);
        notifyVerdict(verdict);
      } else {
        ElMessage.success('已保存（旧内容已存档为历史版本）');
      }
      await loadDetail();
    } else {
      const result = await articleApi.createArticle({ ...form, submit });
      if (submit && result.decision) {
        notifyVerdict(result);
      } else {
        ElMessage.success('草稿已保存');
      }
      await router.replace('/content/articles/' + result.id + '/edit');
      await loadDetail();
    }
  } finally {
    saving.value = false;
  }
}

async function onCoverUpload(file: File) {
  uploadingCover.value = true;
  try {
    const result = await uploadImage(file);
    form.coverImg = result.url;
    ElMessage.success('封面上传成功');
  } finally {
    uploadingCover.value = false;
  }
  return false;
}

const recordsVisible = ref(false);
const recordsLoading = ref(false);
const records = ref<AuditRecord[]>([]);

async function openRecords() {
  if (!isEdit.value) return;
  recordsVisible.value = true;
  recordsLoading.value = true;
  try {
    records.value = await articleApi.articleAuditRecords(articleId.value);
  } finally {
    recordsLoading.value = false;
  }
}

const versionVisible = ref(false);
const versions = ref<ArticleVersion[]>([]);
const selectedVersions = ref<ArticleVersion[]>([]);
const versionDetailVisible = ref(false);
const versionDetail = ref<{ version: number; title: string; content: string } | null>(null);
const diffVisible = ref(false);
const diff = ref<DiffResult | null>(null);

async function openVersions() {
  versions.value = await articleApi.listVersions(articleId.value);
  selectedVersions.value = [];
  versionVisible.value = true;
}

function onVersionSelectionChange(rows: ArticleVersion[]) {
  selectedVersions.value = rows;
}

async function viewVersion(row: ArticleVersion) {
  versionDetail.value = await articleApi.getVersionContent(articleId.value, row.id);
  versionDetailVisible.value = true;
}

async function restore(row: ArticleVersion) {
  await ElMessageBox.confirm('恢复 v' + row.version + ' 会把当前内容存为新版本并回写该版本，确定继续？', '提示', { type: 'warning' });
  await articleApi.restoreVersion(articleId.value, row.id);
  ElMessage.success('已恢复，文章状态回落为草稿');
  versionVisible.value = false;
  await loadDetail();
}

async function openDiff() {
  const sorted = [...selectedVersions.value].sort((a, b) => a.version - b.version);
  diff.value = await articleApi.diffVersions(articleId.value, sorted[0]!.version, sorted[1]!.version);
  diffVisible.value = true;
}

onMounted(async () => {
  await Promise.all([
    categoryApi.listCategories().then((data) => { categories.value = data; }).catch(() => undefined),
    tagApi.listTags().then((data) => { tags.value = data; }).catch(() => undefined),
    loadDetail()
  ]);
  // 新建文章没有详情，这里先算一次，面板从打开就有反馈
  if (!quality.value) await refreshQuality();
});
</script>

<style scoped>
/* ------------------------------- 页面骨架 ------------------------------- */
.editor-page { padding: 0 0 32px; }

/* ------------------------------- 吸顶操作条 ------------------------------- */
.editor-bar {
  position: sticky;
  top: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px 24px;
  background: var(--header-bg);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.bar-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.back-btn {
  width: 34px; height: 34px; flex: none;
  display: grid; place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-body);
  cursor: pointer;
  transition: all 0.18s ease;
}
.back-btn:hover { color: var(--chip-brand-text); border-color: var(--chip-brand-border); background: var(--chip-brand-bg); }
.bar-title h1 { margin: 0; font-size: 17px; font-weight: 650; color: var(--text-strong); }
.bar-sub { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.bar-remark { font-size: 12px; color: var(--text-muted); }
.bar-remark--warn { color: var(--warn-700); }
.bar-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }

/* ------------------------------- 两栏主体 ------------------------------- */
.editor-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 18px;
  padding: 18px 24px 0;
  align-items: start;
}

/* 左：稿纸 */
.doc-card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 26px 28px 18px;
}
.doc-form :deep(.el-form-item) { margin-bottom: 0; }
.doc-form :deep(.el-form-item__content) { display: block; line-height: 1.5; }
.doc-form :deep(.el-form-item__error) { position: static; margin-top: 6px; }

/* 大标题：无边框、直接当文档标题用 */
.doc-title :deep(.el-input__wrapper) {
  box-shadow: none !important;
  padding: 0;
  background: transparent;
}
.doc-title :deep(.el-input__inner) {
  height: 46px;
  font-size: 25px;
  font-weight: 680;
  letter-spacing: -0.4px;
  color: var(--text-strong);
}
.doc-title :deep(.el-input__inner::placeholder) { color: var(--text-faint); font-weight: 600; }

/* 摘要：弱化的副标题 */
.summary-item { margin-top: 6px !important; }
.doc-summary :deep(.el-textarea__inner) {
  box-shadow: none !important;
  padding: 0;
  background: transparent;
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-body);
  resize: none;
}
.doc-summary :deep(.el-input__count) { background: transparent; color: var(--text-faint); }
.doc-divider { margin: 16px 0 18px; border-color: var(--line-soft); }
.content-item { margin-bottom: 6px !important; }

/* 右：设置面板 */
.settings { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 86px; }
.panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: 16px 18px;
}
.panel-title { margin: 0 0 12px; font-size: 13px; font-weight: 650; color: var(--text-strong); }
.field { margin-bottom: 12px; }
.field:last-child { margin-bottom: 0; }
.field label { display: block; margin-bottom: 6px; font-size: 12px; color: var(--text-muted); }

/* 封面 */
.cover-upload { width: 100%; }
.cover-upload :deep(.el-upload) { width: 100%; background: transparent; }
.cover-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  height: 118px;
  border: 1px dashed var(--line);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-muted);
  transition: all 0.18s ease;
}
.cover-empty:hover { border-color: var(--chip-brand-border); background: var(--chip-brand-bg); color: var(--chip-brand-text); }
.cover-empty strong { font-size: 13px; font-weight: 600; }
.cover-empty em { font-style: normal; font-size: 11px; color: var(--text-faint); }
.cover-empty.is-loading { opacity: 0.7; }
.cover-preview { position: relative; height: 118px; border-radius: var(--radius-md); overflow: hidden; }
.cover-preview img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-mask {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  background: rgba(11, 18, 32, 0.55);
  color: #fff; font-size: 13px; font-weight: 500;
  opacity: 0; transition: opacity 0.2s ease;
}
.cover-preview:hover .cover-mask { opacity: 1; }
.cover-remove { margin-top: 6px; }

/* 流程说明 */
.flow { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
.flow li { display: flex; align-items: flex-start; gap: 8px; font-size: 12.5px; color: var(--text-body); line-height: 1.5; }
.flow-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; margin-top: 6px; }
.flow-dot--1 { background: var(--ink-300); }
.flow-dot--2 { background: var(--warn-500); }
.flow-dot--3 { background: var(--ok-500); }
.flow-dot--4 { background: var(--brand-400); }

/* 统计 */
.panel--stat { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; color: var(--text-muted); }
.panel--stat b { color: var(--text-strong); font-weight: 600; }

/* ------------------------------- 质量体检 ------------------------------- */
.panel--quality .panel-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.q-grade {
  font-size: 11px; font-weight: 600; padding: 1px 8px; border-radius: 999px;
  color: var(--text-body); background: var(--line-soft);
}
/* 用 color-mix 而不是固定的 -50 底：深浅两套主题都成立 */
.q-grade--good { color: var(--ok-500); background: color-mix(in srgb, var(--ok-500) 15%, transparent); }
.q-grade--ok { color: var(--warn-500); background: color-mix(in srgb, var(--warn-500) 15%, transparent); }
.q-grade--bad { color: var(--danger-500); background: color-mix(in srgb, var(--danger-500) 15%, transparent); }

.q-head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.q-ring { width: 64px; height: 64px; border-radius: 50%; flex: none; display: grid; place-items: center; transition: background 0.35s ease; }
.q-ring-inner {
  width: 50px; height: 50px; border-radius: 50%; background: var(--surface);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.q-score { font-size: 18px; font-weight: 700; color: var(--text-strong); line-height: 1; }
.q-unit { font-size: 10px; color: var(--text-faint); margin-top: 1px; }

.q-dims { flex: 1; min-width: 0; margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 5px; }
.q-dim { display: flex; align-items: center; gap: 8px; }
.q-dim-label { width: 52px; flex: none; font-size: 11.5px; color: var(--text-muted); }
.q-track { flex: 1; height: 6px; border-radius: 999px; background: var(--line-soft); overflow: hidden; }
.q-track i { display: block; height: 100%; border-radius: 999px; transition: width 0.35s ease; }
.q-fill--good { background: var(--ok-500); }
.q-fill--ok { background: var(--warn-500); }
.q-fill--bad { background: var(--danger-500); }

.q-hint { margin: 0 0 8px; font-size: 12px; color: var(--text-muted); }
.q-hint--good { color: var(--ok-500); }
.q-tips { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow: auto; }
.q-tip {
  font-size: 12px; line-height: 1.55; color: var(--text-body);
  padding-left: 9px; border-left: 2px solid var(--line);
}
.q-tip b { color: var(--text-strong); font-weight: 600; margin-right: 6px; }
.q-tip--bad { border-left-color: var(--danger-500); }
.q-tip--ok { border-left-color: var(--warn-500); }

/* ------------------------------- 版本 / diff ------------------------------- */
.version-actions { margin-top: 12px; display: flex; align-items: center; gap: 12px; }
.version-content { max-height: 50vh; overflow: auto; border: 1px solid var(--line); padding: 12px; border-radius: var(--radius-md); }
.diff-body { max-height: 60vh; overflow: auto; margin-top: 12px; border: 1px solid var(--line); border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 12px; }
.diff-line { display: flex; gap: 8px; padding: 1px 8px; white-space: pre-wrap; word-break: break-all; }
.diff-no { width: 34px; color: var(--text-faint); text-align: right; flex: none; }
.diff-text { flex: 1; }
.diff-add { background: rgba(16, 185, 129, 0.14); }
.diff-del { background: rgba(239, 68, 68, 0.12); }
.diff-same { background: transparent; }
.hint { color: var(--text-muted); font-size: 12px; }

/* ------------------------------- 响应式 ------------------------------- */
@media (max-width: 1100px) {
  .editor-body { grid-template-columns: minmax(0, 1fr); }
  .settings { position: static; }
}
@media (max-width: 700px) {
  .editor-bar { padding: 12px; }
  .editor-body { padding: 12px 12px 0; }
  .doc-card { padding: 18px 16px 12px; }
  .doc-title :deep(.el-input__inner) { font-size: 20px; height: 40px; }
  .bar-actions .el-button { flex: 1; }
}
</style>
