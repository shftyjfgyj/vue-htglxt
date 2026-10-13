<template>
  <div class="page-container">
    <el-row :gutter="16">
      <el-col :xs="24" :md="12">
        <el-card shadow="never" class="page-card">
          <template #header>账号信息</template>
          <div class="avatar-row">
            <el-avatar :size="72" :src="userStore.user?.avatar || undefined">
              {{ userStore.displayName.slice(0, 1) }}
            </el-avatar>
            <div class="avatar-actions">
              <el-upload :show-file-list="false" :before-upload="onAvatarUpload" accept="image/*">
                <el-button size="small" :loading="uploadingAvatar">更换头像</el-button>
              </el-upload>
              <div class="avatar-hint">支持 jpg / png / gif / webp，单文件 ≤2MB</div>
            </div>
          </div>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="用户名">{{ userStore.user?.username }}</el-descriptions-item>
            <el-descriptions-item label="角色">{{ userStore.roles.join('、') }}</el-descriptions-item>
            <el-descriptions-item label="权限数">{{ userStore.permissions.length }}</el-descriptions-item>
            <el-descriptions-item label="最后登录">{{ userStore.user?.lastLoginAt || '—' }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card shadow="never">
          <template #header>修改资料</template>
          <el-form :model="profileForm" label-width="80px">
            <el-form-item label="昵称">
              <el-input v-model="profileForm.nickname" placeholder="显示名称" />
            </el-form-item>
            <el-form-item label="邮箱">
              <el-input v-model="profileForm.email" placeholder="选填" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingProfile" @click="onSaveProfile">保存</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="12">
        <el-card shadow="never">
          <template #header>修改密码</template>
          <el-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" label-width="90px">
            <el-form-item label="原密码" prop="oldPassword">
              <el-input v-model="pwdForm.oldPassword" type="password" show-password />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input v-model="pwdForm.newPassword" type="password" show-password placeholder="至少 8 位，含字母和数字" />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input v-model="pwdForm.confirmPassword" type="password" show-password />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingPassword" @click="onChangePassword">修改密码</el-button>
              <span class="hint">修改后所有会话失效，需要重新登录</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { changeMyPassword } from '@/api/auth';
import { updateMe, uploadAvatar } from '@/api/user';
import { useUserStore } from '@/stores/user';

const router = useRouter();
const userStore = useUserStore();

const savingProfile = ref(false);
const uploadingAvatar = ref(false);
const savingPassword = ref(false);
const profileForm = reactive({ nickname: '', email: '' });

const pwdFormRef = ref<FormInstance>();
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const pwdRules: FormRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { pattern: /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/, message: '至少 8 位且含字母和数字', trigger: 'blur' }
  ],
  confirmPassword: [
    {
      validator: (_rule, value, callback) => {
        if (value !== pwdForm.newPassword) callback(new Error('两次输入的密码不一致'));
        else callback();
      },
      trigger: 'blur'
    }
  ]
};

async function onSaveProfile() {
  savingProfile.value = true;
  try {
    await updateMe({ nickname: profileForm.nickname, email: profileForm.email });
    await userStore.fetchProfile();
    ElMessage.success('资料已更新');
  } finally {
    savingProfile.value = false;
  }
}

async function onAvatarUpload(file: File) {
  uploadingAvatar.value = true;
  try {
    const result = await uploadAvatar(file);
    await userStore.fetchProfile();
    ElMessage.success('头像已更新（旧头像文件已清理）：' + result.avatar);
  } finally {
    uploadingAvatar.value = false;
  }
  return false;
}

async function onChangePassword() {
  const valid = await pwdFormRef.value?.validate().catch(() => false);
  if (!valid) return;
  savingPassword.value = true;
  try {
    await changeMyPassword({ oldPassword: pwdForm.oldPassword, newPassword: pwdForm.newPassword });
    ElMessage.success('密码已修改，请重新登录');
    userStore.clear();
    await router.push('/login');
  } finally {
    savingPassword.value = false;
  }
}

onMounted(async () => {
  if (!userStore.user) await userStore.fetchProfile();
  profileForm.nickname = userStore.user?.nickname ?? '';
  profileForm.email = userStore.user?.email ?? '';
});
</script>

<style scoped>
.hint { margin-left: 12px; color: #909399; font-size: 12px; }
.avatar-row { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
.avatar-row :deep(.el-avatar) {
  background: linear-gradient(135deg, var(--avatar-bg), var(--avatar-bg));
  color: var(--avatar-fg);
  font-size: 24px;
  font-weight: 600;
  box-shadow: var(--shadow-brand);
}
.avatar-actions { display: flex; flex-direction: column; gap: 6px; }
.avatar-hint { color: var(--text-muted); font-size: 12px; }
</style>
