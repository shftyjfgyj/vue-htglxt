<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="table-toolbar">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-permission="'category:create'" type="success" :icon="Plus" @click="openCreate">新建分类</el-button>
      </div>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="name" label="分类名称" min-width="140" />
        <el-table-column prop="alias" label="别名" min-width="140" />
        <el-table-column prop="sort" label="排序" width="90" />
        <el-table-column prop="articleCount" label="文章数" width="100" />
        <el-table-column prop="createdAt" label="创建时间" width="170" />
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'category:update'" link type="primary" size="small" @click="openEdit(row as CategoryItem)">编辑</el-button>
            <el-button v-permission="'category:delete'" link type="danger" size="small" @click="onRemove(row as CategoryItem)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="visible" :title="editing ? '编辑分类' : '新建分类'" width="460px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="名称" prop="name"><el-input v-model="form.name" placeholder="如：技术分享" /></el-form-item>
        <el-form-item label="别名" prop="alias"><el-input v-model="form.alias" placeholder="如：tech（唯一）" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="form.sort" :min="0" :max="9999" /></el-form-item>
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
import * as api from '@/api/category';
import type { CategoryItem } from '@/types/content';

const loading = ref(false);
const submitting = ref(false);
const rows = ref<CategoryItem[]>([]);
const visible = ref(false);
const editing = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({ name: '', alias: '', sort: 0 });
const rules: FormRules = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
  alias: [
    { required: true, message: '请输入别名', trigger: 'blur' },
    { pattern: /^[a-zA-Z][a-zA-Z0-9_-]*$/, message: '字母开头，仅含字母/数字/下划线/连字符', trigger: 'blur' }
  ]
};

async function load() {
  loading.value = true;
  try { rows.value = await api.listCategories(); } finally { loading.value = false; }
}

function openCreate() {
  editing.value = false;
  editingId.value = null;
  Object.assign(form, { name: '', alias: '', sort: 0 });
  visible.value = true;
}

function openEdit(row: CategoryItem) {
  editing.value = true;
  editingId.value = row.id;
  Object.assign(form, { name: row.name, alias: row.alias, sort: row.sort });
  visible.value = true;
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    if (editing.value && editingId.value) await api.updateCategory(editingId.value, { ...form });
    else await api.createCategory({ ...form });
    ElMessage.success(editing.value ? '分类已更新' : '分类已创建');
    visible.value = false;
    await load();
  } finally { submitting.value = false; }
}

async function onRemove(row: CategoryItem) {
  await ElMessageBox.confirm('确定删除分类「' + row.name + '」吗？', '警告', { type: 'warning' });
  await api.removeCategory(row.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(load);
</script>