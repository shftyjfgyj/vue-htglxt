<template>
  <div class="page-container">
    <el-card shadow="never" class="page-card">
      <div class="table-toolbar">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-permission="'role:create'" type="success" :icon="Plus" @click="openCreate">新建角色</el-button>
      </div>

      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column prop="code" label="角色编码" width="140" />
        <el-table-column prop="name" label="角色名称" min-width="120" />
        <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
        <el-table-column prop="permissionCount" label="权限数" width="90" />
        <el-table-column prop="userCount" label="用户数" width="90" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="row.isSystem === 1 ? 'info' : 'success'" size="small">
              {{ row.isSystem === 1 ? '内置' : '自定义' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button v-permission="'role:update'" link type="primary" size="small" @click="openEdit(row as RoleItem)">编辑</el-button>
            <el-button v-permission="'role:assignPerm'" link type="primary" size="small" :disabled="row.code === 'admin'" @click="openPermissions(row as RoleItem)">分配权限</el-button>
            <el-button v-permission="'role:delete'" link type="danger" size="small" :disabled="row.isSystem === 1" @click="onRemove(row as RoleItem)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑角色' : '新建角色'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="角色编码" prop="code">
          <el-input v-model="form.code" :disabled="editing" placeholder="小写字母/数字/下划线，如 operator" />
        </el-form-item>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="如：运营专员" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="选填" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permVisible" :title="'分配权限 - ' + currentRoleName" width="720px">
      <el-skeleton v-if="permLoading" :rows="6" animated />
      <template v-else>
        <div class="perm-toolbar">
          <el-input
            v-model="permKeyword"
            placeholder="搜索权限名称或权限码"
            clearable
            :prefix-icon="Search"
            class="perm-search"
          />
          <span class="perm-summary">已选 <b>{{ checkedPermissionIds.length }}</b> / {{ totalPermissionCount }}</span>
          <el-button link type="primary" @click="selectAllPermissions">全选</el-button>
          <el-button link type="info" @click="clearAllPermissions">清空</el-button>
        </div>

        <div class="perm-cards">
          <section v-for="group in filteredPermissionGroups" :key="group.module" class="perm-card">
            <header class="perm-card-head">
              <el-checkbox
                :model-value="isGroupChecked(group)"
                :indeterminate="isGroupIndeterminate(group)"
                @change="(checked: string | number | boolean) => toggleGroup(group, checked === true)"
              >
                <span class="perm-module">{{ moduleLabel(group.module) }}</span>
              </el-checkbox>
              <span class="perm-count">{{ selectedCountInGroup(group) }}/{{ group.permissions.length }}</span>
            </header>

            <div class="perm-chips">
              <button
                v-for="perm in group.permissions"
                :key="perm.id"
                type="button"
                class="perm-chip"
                :class="{ 'is-active': checkedPermissionIds.includes(perm.id) }"
                @click="togglePermission(perm.id)"
              >
                <el-icon v-if="checkedPermissionIds.includes(perm.id)" class="perm-chip-icon"><Select /></el-icon>
                <span class="perm-chip-name">{{ perm.name }}</span>
                <code>{{ perm.code }}</code>
              </button>
            </div>
          </section>
          <el-empty v-if="filteredPermissionGroups.length === 0" description="没有匹配的权限" :image-size="56" />
        </div>
      </template>
      <template #footer>
        <el-button @click="permVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSavePermissions">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { Plus, Refresh, Search, Select } from '@element-plus/icons-vue';
import * as roleApi from '@/api/role';
import type { PermissionGroup, RoleItem } from '@/types';

const loading = ref(false);
const submitting = ref(false);
const rows = ref<RoleItem[]>([]);

const dialogVisible = ref(false);
const editing = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const form = reactive({ code: '', name: '', description: '' });

const rules: FormRules = {
  code: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    { pattern: /^[a-z][a-z0-9_]*$/, message: '小写字母开头，仅含小写字母/数字/下划线', trigger: 'blur' }
  ],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }]
};

const permVisible = ref(false);
const permLoading = ref(false);
const currentRoleId = ref<number | null>(null);
const currentRoleName = ref('');
const permissionGroups = ref<PermissionGroup[]>([]);
const checkedPermissionIds = ref<number[]>([]);
const permKeyword = ref('');

const MODULE_LABELS: Record<string, string> = {
  dashboard: '数据看板',
  article: '文章',
  category: '分类',
  tag: '标签',
  comment: '评论',
  user: '用户',
  role: '角色',
  log: '日志',
  system: '系统'
};

function moduleLabel(module: string) {
  return MODULE_LABELS[module] ?? module;
}

/** 按关键词过滤（匹配模块名 / 权限名 / 权限码） */
const filteredPermissionGroups = computed(() => {
  const keyword = permKeyword.value.trim().toLowerCase();
  if (!keyword) return permissionGroups.value;
  return permissionGroups.value
    .map((group) => ({
      ...group,
      permissions: group.permissions.filter(
        (perm) =>
          perm.name.toLowerCase().includes(keyword) ||
          perm.code.toLowerCase().includes(keyword) ||
          moduleLabel(group.module).includes(keyword)
      )
    }))
    .filter((group) => group.permissions.length > 0);
});

const totalPermissionCount = computed(() =>
  permissionGroups.value.reduce((sum, group) => sum + group.permissions.length, 0)
);

function selectedCountInGroup(group: PermissionGroup) {
  return group.permissions.filter((perm) => checkedPermissionIds.value.includes(perm.id)).length;
}

function togglePermission(id: number) {
  checkedPermissionIds.value = checkedPermissionIds.value.includes(id)
    ? checkedPermissionIds.value.filter((item) => item !== id)
    : [...checkedPermissionIds.value, id];
}

function selectAllPermissions() {
  checkedPermissionIds.value = permissionGroups.value.flatMap((group) => group.permissions.map((perm) => perm.id));
}

function clearAllPermissions() {
  checkedPermissionIds.value = [];
}

async function load() {
  loading.value = true;
  try {
    rows.value = await roleApi.listRoles();
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = false;
  editingId.value = null;
  Object.assign(form, { code: '', name: '', description: '' });
  dialogVisible.value = true;
}

function openEdit(row: RoleItem) {
  editing.value = true;
  editingId.value = row.id;
  Object.assign(form, { code: row.code, name: row.name, description: row.description });
  dialogVisible.value = true;
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    if (editing.value && editingId.value) {
      await roleApi.updateRole(editingId.value, { name: form.name, description: form.description });
      ElMessage.success('角色已更新');
    } else {
      await roleApi.createRole({ code: form.code, name: form.name, description: form.description });
      ElMessage.success('角色已创建');
    }
    dialogVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function openPermissions(row: RoleItem) {
  currentRoleId.value = row.id;
  currentRoleName.value = row.name;
  permVisible.value = true;
  permLoading.value = true;
  try {
    const [groups, ids] = await Promise.all([roleApi.listPermissions(), roleApi.getRolePermissions(row.id)]);
    permissionGroups.value = groups.filter((group) => group.module !== 'system');
    checkedPermissionIds.value = ids;
  } finally {
    permLoading.value = false;
  }
}

function isGroupChecked(group: PermissionGroup) {
  return group.permissions.every((perm) => checkedPermissionIds.value.includes(perm.id));
}

function isGroupIndeterminate(group: PermissionGroup) {
  const hit = group.permissions.filter((perm) => checkedPermissionIds.value.includes(perm.id)).length;
  return hit > 0 && hit < group.permissions.length;
}

function toggleGroup(group: PermissionGroup, checked: boolean) {
  const ids = group.permissions.map((perm) => perm.id);
  const rest = checkedPermissionIds.value.filter((id) => !ids.includes(id));
  checkedPermissionIds.value = checked ? [...rest, ...ids] : rest;
}

async function onSavePermissions() {
  if (!currentRoleId.value) return;
  submitting.value = true;
  try {
    await roleApi.setRolePermissions(currentRoleId.value, checkedPermissionIds.value);
    ElMessage.success('权限已保存，相关用户下次请求即生效');
    permVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function onRemove(row: RoleItem) {
  await ElMessageBox.confirm('确定删除角色「' + row.name + '」吗？', '警告', { type: 'warning' });
  await roleApi.removeRole(row.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(load);
</script>

<style scoped>
.perm-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 14px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--line-soft);
}
.perm-search { width: 240px; }
.perm-summary { flex: 1; font-size: 13px; color: var(--text-muted); }
.perm-summary b { color: var(--brand-600); font-size: 15px; }

.perm-cards { display: flex; flex-direction: column; gap: 14px; max-height: 56vh; overflow: auto; padding-right: 4px; }
.perm-card {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  background: var(--surface);
}
.perm-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.perm-module { font-weight: 650; font-size: 13.5px; color: var(--text-strong); }
.perm-count {
  font-size: 12px;
  color: var(--text-muted);
  background: var(--chip-bg);
  border-radius: 999px;
  padding: 1px 10px;
}
.perm-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.perm-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--text-body);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.16s ease;
}
.perm-chip:hover { border-color: var(--chip-brand-border); background: var(--chip-brand-bg); color: var(--chip-brand-text); }
.perm-chip.is-active {
  border-color: transparent;
  background: linear-gradient(135deg, var(--brand-500), var(--brand-600));
  color: #fff;
  box-shadow: 0 6px 16px -8px rgba(196, 52, 27, 0.9);
}
.perm-chip code {
  font-family: var(--font-mono);
  font-size: 11px;
  opacity: 0.75;
  background: rgba(127, 127, 127, 0.12);
  padding: 0 5px;
  border-radius: 4px;
}
.perm-chip-icon { font-size: 12px; }
</style>