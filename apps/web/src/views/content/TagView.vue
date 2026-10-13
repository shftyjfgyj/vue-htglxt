<template>
  <div class="page-container">
    <el-card shadow="never" class="page-card">
      <template #header>
        <div class="header-row">
          <span>标签管理</span>
          <div>
            <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
            <el-button v-permission="'tag:create'" type="success" :icon="Plus" size="small" @click="openCreate">新建标签</el-button>
          </div>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="标签" min-width="200">
          <template #default="{ row }">
            <span class="tag-pill" :style="softStyle((row as TagItem).color)">
              <i class="tag-dot" :style="{ background: (row as TagItem).color }" />{{ (row as TagItem).name }}
            </span>
          </template>
        </el-table-column>
        <el-table-column prop="color" label="颜色值" width="120" />
        <el-table-column prop="usageCount" label="被引用" width="100" />
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'tag:update'" link type="primary" size="small" @click="openEdit(row as TagItem)">编辑</el-button>
            <el-button v-permission="'tag:delete'" link type="danger" size="small" @click="onRemove(row as TagItem)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>热门标签 Top 10（按被引用次数，服务端排序）</template>
      <span v-for="item in popular" :key="item.id" class="tag-pill tag-pill--lg" :style="softStyle(item.color)">
        <i class="tag-dot" :style="{ background: item.color }" />{{ item.name }}
        <em class="tag-count">{{ item.usageCount }}</em>
      </span>
      <el-empty v-if="popular.length === 0" description="暂无数据" :image-size="60" />
    </el-card>

    <el-dialog v-model="visible" :title="editing ? '编辑标签' : '新建标签'" width="420px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="70px">
        <el-form-item label="名称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="颜色">
          <el-color-picker v-model="form.color" :predefine="TAG_COLORS" />
          <span class="color-text">{{ form.color }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import * as api from '@/api/tag';
import type { TagItem } from '@/types/content';

const loading = ref(false);
const submitting = ref(false);
const rows = ref<TagItem[]>([]);
const popular = ref<TagItem[]>([]);
const visible = ref(false);
const editing = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();

/**
 * 标签默认色 / 非法值兜底色。
 * 不再硬编码 Element 自带的 #409EFF（那是原味蓝，和品牌靛蓝同屏会显得是两个系统的颜色），
 * 改为直接读主题令牌 --brand-500，主题一改这里自动跟着走。
 */
const FALLBACK_COLOR = (() => {
  if (typeof window === 'undefined') return '#C4341B';
  const value = getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toUpperCase() : '#C4341B';
})();

/** 色板预置：编辑部实际在用的三种色（红 / 青绿 / 琥珀）。
    每个色都同时满足「落在白卡片上」和「落在自己 8% 浅底上」>= 4.5，
    所以标签名与浅底药丸两种呈现都读得清。 */
const TAG_COLORS = [
  '#B8422A', '#2F6F6B', '#8A5A12',
  '#C94A2E', '#245A56', '#6E4608'
];

const form = reactive({ name: '', color: FALLBACK_COLOR });
const rules: FormRules = { name: [{ required: true, message: '请输入标签名称', trigger: 'blur' }] };

/** 用标签自身颜色生成柔和样式：浅底 + 同色文字，避免实心原色过于刺眼 */
function softStyle(color: string) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(color) ? color : FALLBACK_COLOR;
  return { background: safe + '14', color: safe, borderColor: safe + '33' };
}

async function load() {
  loading.value = true;
  try {
    const [list, top] = await Promise.all([api.listTags(), api.listPopularTags(10)]);
    rows.value = list;
    popular.value = top;
  } finally { loading.value = false; }
}

function openCreate() {
  editing.value = false;
  editingId.value = null;
  Object.assign(form, { name: '', color: FALLBACK_COLOR });
  visible.value = true;
}

function openEdit(row: TagItem) {
  editing.value = true;
  editingId.value = row.id;
  Object.assign(form, { name: row.name, color: row.color });
  visible.value = true;
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    if (editing.value && editingId.value) await api.updateTag(editingId.value, { ...form });
    else await api.createTag({ ...form });
    ElMessage.success(editing.value ? '标签已更新' : '标签已创建');
    visible.value = false;
    await load();
  } finally { submitting.value = false; }
}

async function onRemove(row: TagItem) {
  await ElMessageBox.confirm('确定删除标签「' + row.name + '」吗？', '警告', { type: 'warning' });
  await api.removeTag(row.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(load);
</script>

<style scoped>
/* 标签药丸：色点 + 柔色底，数据库里的原始颜色依然被尊重 */
.header-row { display: flex; align-items: center; justify-content: space-between; }
.tag-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12.5px;
  font-weight: 500;
  margin: 0 8px 8px 0;
}
.tag-pill--lg { padding: 4px 12px; font-size: 13px; }
.tag-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.tag-count { font-style: normal; opacity: 0.7; font-size: 11.5px; }
.color-text { margin-left: 10px; color: var(--text-muted); font-size: 12px; }
</style>