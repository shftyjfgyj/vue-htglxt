<template>
  <div class="page-container">
    <el-card shadow="never" class="page-card">
      <div class="table-toolbar">
        <el-input v-model="query.keyword" placeholder="用户名 / 昵称 / 邮箱" clearable style="width: 240px" @keyup.enter="reload" />
        <el-select v-model="query.status" placeholder="状态" clearable style="width: 120px">
          <el-option label="启用" :value="1" />
          <el-option label="停用" :value="0" />
        </el-select>
        <el-button type="primary" :icon="Search" @click="reload">查询</el-button>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <el-button v-permission="'user:create'" type="success" :icon="Plus" @click="openCreate">新建用户</el-button>
        <el-button v-if="cols.isCustomized.value" link type="info" title="清除记忆的列宽" @click="cols.reset()">重置列宽</el-button>
        <el-tag v-if="queryMemory.restored.value" size="small" type="info" closable @close="queryMemory.clearMemory()">已恢复上次筛选</el-tag>
      </div>

      <el-table v-loading="loading" :data="rows" border stripe @header-dragend="cols.onHeaderDragend">
        <el-table-column v-bind="cols.colProps('ID')" prop="id" label="ID" />
        <el-table-column v-bind="cols.colProps('用户名')" prop="username" label="用户名" />
        <el-table-column v-bind="cols.colProps('昵称')" prop="nickname" label="昵称" />
        <el-table-column v-bind="cols.colProps('邮箱')" prop="email" label="邮箱" show-overflow-tooltip />
        <el-table-column v-bind="cols.colProps('角色')" prop="roles" label="角色" />
        <el-table-column v-bind="cols.colProps('状态')" label="状态">
          <template #default="{ row }">
            <el-tag :type="row.status === 1 ? 'success' : 'danger'" size="small">
              {{ row.status === 1 ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="自动审核" width="150">
          <template #default="{ row }">
            <el-tag v-if="(row as UserItem).autoAudit" size="small" type="success" effect="plain">可信作者</el-tag>
            <el-tag v-else-if="(row as UserItem).violationCount" size="small" type="danger" effect="plain">
              违规 {{ (row as UserItem).violationCount }} 次
            </el-tag>
            <span v-else class="trust-normal">常规审核</span>
          </template>
        </el-table-column>
        <el-table-column v-bind="cols.colProps('最后登录')" prop="lastLoginAt" label="最后登录" />
        <el-table-column v-bind="cols.colProps('操作')" label="操作" fixed="right" class-name="ops-cell">
          <template #default="{ row }">
            <el-button v-permission="'user:update'" link type="primary" size="small" @click="openEdit(row as UserItem)">编辑</el-button>
            <el-button v-permission="'role:assignUser'" link type="primary" size="small" @click="openAssign(row as UserItem)">角色</el-button>
            <el-dropdown trigger="click" @command="(command: string) => onRowCommand(command, row as UserItem)">
              <el-button link type="info" size="small" class="more-btn">
                更多<el-icon><ArrowDown /></el-icon>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-permission="'user:update'" command="trust" :divided="(row as UserItem).violationCount ? false : true">
          {{ (row as UserItem).autoAudit ? '取消可信作者' : '设为可信作者' }}
        </el-dropdown-item>
        <el-dropdown-item v-if="(row as UserItem).violationCount" v-permission="'user:update'" command="clearViolation">
          清除违规记录（{{ (row as UserItem).violationCount }}）
        </el-dropdown-item>
        <el-dropdown-item v-permission="'user:resetPwd'" command="resetPwd">重置密码</el-dropdown-item>
                  <el-dropdown-item v-permission="'user:status'" command="toggleStatus">
                    {{ (row as UserItem).status === 1 ? '停用账号' : '启用账号' }}
                  </el-dropdown-item>
                  <el-dropdown-item v-permission="'user:delete'" command="delete" divided>删除用户</el-dropdown-item>
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

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑用户' : '新建用户'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" :disabled="editing" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item v-if="!editing" label="密码" prop="password">
          <el-input v-model="form.password" type="password" show-password placeholder="至少 8 位，含字母和数字" />
        </el-form-item>
        <el-form-item label="昵称" prop="nickname">
          <el-input v-model="form.nickname" placeholder="显示名称" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="选填" />
        </el-form-item>
        <el-form-item v-if="!editing" label="角色" prop="roleIds">
          <el-select v-model="form.roleIds" multiple placeholder="选择角色" style="width: 100%">
            <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onSubmit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="assignVisible" title="分配角色" width="420px">
      <el-select v-model="assignRoleIds" multiple placeholder="选择角色" style="width: 100%">
        <el-option v-for="role in roles" :key="role.id" :label="role.name + '（' + role.code + '）'" :value="role.id" />
      </el-select>
      <template #footer>
        <el-button @click="assignVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="onAssignSubmit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { ArrowDown, Plus, Refresh, Search } from '@element-plus/icons-vue';
import { useTableColumns } from '@/composables/useTableColumns';
import * as userApi from '@/api/user';
import * as roleApi from '@/api/role';
import type { RoleItem, UserItem } from '@/types';
import { useQueryMemory } from '@/composables/useQueryMemory';

const loading = ref(false);
const submitting = ref(false);
const rows = ref<UserItem[]>([]);
const total = ref(0);
const roles = ref<RoleItem[]>([]);

const cols = useTableColumns('users', {
  ID: { width: 70 },
  用户名: { minWidth: 120 },
  昵称: { minWidth: 120 },
  邮箱: { minWidth: 180 },
  角色: { minWidth: 140 },
  状态: { width: 100 },
  最后登录: { width: 160 },
  操作: { width: 190 }
});

const query = reactive<{ keyword: string; status: number | undefined; page: number; pageSize: number }>({
  keyword: '', status: undefined, page: 1, pageSize: 10
});
/** 记住上次筛选条件（sessionStorage），切页返回后自动恢复 */
const queryMemory = useQueryMemory('users', query);


const dialogVisible = ref(false);
const editing = ref(false);
const editingId = ref<number | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<{ username: string; password: string; nickname: string; email: string; roleIds: number[] }>({
  username: '', password: '', nickname: '', email: '', roleIds: []
});

const rules: FormRules = {
  username: [{ required: true, min: 3, message: '用户名至少 3 位', trigger: 'blur' }],
  password: [{ required: true, min: 8, message: '密码至少 8 位', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  // 角色必选：不选角色会建出「能登录但零权限」的账号，
  // 也避免把 editor 这类偏大的权限无意识地授出去。编辑态该字段不渲染，不参与校验。
  roleIds: [{ required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' }]
};

const assignVisible = ref(false);
const assignUserId = ref<number | null>(null);
const assignRoleIds = ref<number[]>([]);

async function load() {
  loading.value = true;
  try {
    const result = await userApi.listUsers({
      keyword: query.keyword || undefined,
      status: query.status,
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
  reload();
}

async function loadRoles() {
  try {
    roles.value = await roleApi.listRoles();
  } catch {
    roles.value = [];
  }
}

function openCreate() {
  editing.value = false;
  editingId.value = null;
  Object.assign(form, { username: '', password: '', nickname: '', email: '', roleIds: [] });
  dialogVisible.value = true;
}

function openEdit(row: UserItem) {
  editing.value = true;
  editingId.value = row.id;
  Object.assign(form, { username: row.username, password: '', nickname: row.nickname, email: row.email, roleIds: [] });
  dialogVisible.value = true;
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  submitting.value = true;
  try {
    if (editing.value && editingId.value) {
      await userApi.updateUser(editingId.value, { nickname: form.nickname, email: form.email });
      ElMessage.success('用户已更新');
    } else {
      await userApi.createUser({
        username: form.username,
        password: form.password,
        nickname: form.nickname || form.username,
        email: form.email,
        roleIds: form.roleIds
      });
      ElMessage.success('用户已创建');
    }
    dialogVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

async function openAssign(row: UserItem) {
  assignUserId.value = row.id;
  assignRoleIds.value = (await userApi.getUserRoles(row.id)).map((role) => role.id);
  assignVisible.value = true;
}

async function onAssignSubmit() {
  if (!assignUserId.value) return;
  submitting.value = true;
  try {
    await userApi.setUserRoles(assignUserId.value, assignRoleIds.value);
    ElMessage.success('角色已更新');
    assignVisible.value = false;
    await load();
  } finally {
    submitting.value = false;
  }
}

/** 行内「更多」下拉：低频且破坏性操作收起来，避免操作列过宽遮挡内容 */
async function onRowCommand(command: string, row: UserItem) {
  if (command === 'trust') {
    const next = !(row as UserItem).autoAudit;
    await userApi.setUserTrust(row.id, { autoAudit: next });
    ElMessage.success(next ? '已设为可信作者：无违禁词时文章直接发布' : '已取消可信作者：恢复人工审核');
    await load();
    return;
  }
  if (command === 'clearViolation') {
    await userApi.setUserTrust(row.id, { resetViolations: true });
    ElMessage.success('已清除违规记录，该用户恢复自动审核信任');
    await load();
    return;
  }
  if (command === 'resetPwd') return onResetPassword(row);
  if (command === 'toggleStatus') return onToggleStatus(row);
  if (command === 'delete') return onRemove(row);
  return undefined;
}

async function onToggleStatus(row: UserItem) {
  const next = row.status === 1 ? 0 : 1;
  await ElMessageBox.confirm(
    next === 0 ? '停用后该用户所有会话会立即失效，确定继续？' : '确定启用该用户？',
    '提示',
    { type: 'warning' }
  );
  await userApi.setUserStatus(row.id, next);
  ElMessage.success(next === 1 ? '已启用' : '已停用');
  await load();
}

async function onResetPassword(row: UserItem) {
  const result = await ElMessageBox.prompt('请输入新密码（至少 8 位，含字母和数字）', '重置密码 ' + row.username, {
    inputPattern: /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/,
    inputErrorMessage: '密码至少 8 位且同时包含字母和数字'
  });
  await userApi.resetUserPassword(row.id, result.value);
  ElMessage.success('密码已重置，该用户会话已全部失效');
}

async function onRemove(row: UserItem) {
  await ElMessageBox.confirm('确定删除用户 ' + row.username + ' 吗？（软删除，可保留数据）', '警告', { type: 'warning' });
  await userApi.removeUser(row.id);
  ElMessage.success('已删除');
  await load();
}

onMounted(async () => {
  await Promise.all([load(), loadRoles()]);
});
</script>

<style scoped>
.trust-normal { color: var(--text-faint); font-size: 12.5px; }
</style>

<style scoped>
.more-btn { display: inline-flex; align-items: center; gap: 2px; }
:deep(.ops-cell) .cell { white-space: nowrap; }
</style>