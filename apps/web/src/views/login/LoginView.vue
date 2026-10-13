<template>
  <div class="login-page">
    <div class="login-glow login-glow--a" />
    <div class="login-glow login-glow--b" />

    <div class="login-shell">
      <!-- 左侧品牌区（窄屏不渲染，改由 .panel-brand 在表单上方显示；
           用 v-if 而非 CSS 隐藏，保证「后台管理系统」在 DOM 中始终只有一处） -->
      <aside v-if="!appStore.isMobile" class="login-brand">
        <div class="brand-top">
          <div class="brand-mark"><el-icon><Platform /></el-icon></div>
          <span>后台管理系统</span>
        </div>

        <div class="brand-body">
          <h1>让内容运营<br />更专注、更可控</h1>
          <p class="brand-desc">Vue3 + Node + MySQL 全栈重写，内置 RBAC 权限、审核工作流与审计日志。</p>

          <ul class="brand-points">
            <li v-for="point in highlights" :key="point.title">
              <span class="point-icon"><el-icon><component :is="point.icon" /></el-icon></span>
              <span class="point-text">
                <strong>{{ point.title }}</strong>
                <em>{{ point.desc }}</em>
              </span>
            </li>
          </ul>
        </div>

        <div class="brand-foot">© {{ year }} htglxt · 内部管理系统</div>
      </aside>

      <!-- 右侧登录表单 -->
      <section class="login-panel">
        <div class="panel-inner">
          <!-- 窄屏下左侧品牌区被隐藏，这里补一个精简品牌头。
               用 v-if 而不是 CSS 隐藏：桌面端不渲染，避免「后台管理系统」在 DOM 里出现两次。 -->
          <div v-if="appStore.isMobile" class="panel-brand">
            <div class="brand-mark"><el-icon><Platform /></el-icon></div>
            <div class="panel-brand-text">
              <strong>后台管理系统</strong>
              <span>Vue3 · Node · MySQL</span>
            </div>
          </div>

          <header class="panel-head">
            <h2>欢迎回来</h2>
            <p>请使用管理员分配的账号登录</p>
          </header>

          <el-form ref="formRef" :model="form" :rules="rules" size="large" class="login-form" @keyup.enter="onSubmit">
            <el-form-item prop="username">
              <el-input
                ref="usernameRef"
                v-model="form.username"
                name="username"
                autocomplete="username"
                placeholder="用户名"
                :prefix-icon="User"
                clearable
              />
            </el-form-item>
            <el-form-item prop="password">
              <el-input
                v-model="form.password"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="密码"
                :prefix-icon="Lock"
                show-password
              />
            </el-form-item>

            <div class="login-extras">
              <el-checkbox v-model="remember" class="remember">记住用户名</el-checkbox>
              <el-button link type="primary" class="forgot" @click="onForgot">忘记密码？</el-button>
            </div>

            <el-form-item class="submit-item">
              <el-button type="primary" class="login-button" :loading="loading" @click="onSubmit">
                {{ loading ? '登录中…' : '登 录' }}
              </el-button>
            </el-form-item>
          </el-form>

          <div class="demo-box">
            <div class="demo-title"><span>演示账号</span><em>点击即可填充</em></div>
            <el-button
              v-for="item in demoAccounts"
              :key="item.username"
              class="demo-row"
              @click="fillDemo(item)"
            >
              <span class="demo-role">{{ item.role }}</span>
              <span class="demo-account">{{ item.username }} / {{ item.password }}</span>
              <el-icon class="demo-fill"><Right /></el-icon>
            </el-button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { Document, Lock, Platform, Right, Search, User } from '@element-plus/icons-vue';
import { useAppStore } from '@/stores/app';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const appStore = useAppStore();
const formRef = ref<FormInstance>();
const usernameRef = ref<{ focus: () => void }>();
const loading = ref(false);
const year = new Date().getFullYear();

/** 「记住用户名」只存用户名，不存密码 */
const REMEMBER_KEY = 'htglxt.rememberedUser';
const remember = ref(true);

const form = reactive({ username: 'admin', password: '' });
const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
};

const highlights = [
  { icon: Document, title: '内容全流程', desc: '草稿 → 审核 → 发布，含版本快照与 diff' },
  { icon: Lock, title: '细粒度权限', desc: '菜单 / 路由 / 按钮三级 RBAC 控制' },
  { icon: Search, title: '可观测', desc: '操作审计、登录日志与 traceId 追踪' }
];

const demoAccounts = [
  { role: '超级管理员', username: 'admin', password: 'Admin@123456' },
  { role: '内容编辑', username: 'editor', password: 'Editor@123456' },
  { role: '只读访客', username: 'viewer', password: 'Viewer@123456' }
];

onMounted(() => {
  const saved = localStorage.getItem(REMEMBER_KEY);
  if (saved) {
    form.username = saved;
    remember.value = true;
  }
  usernameRef.value?.focus();
});

function fillDemo(item: { username: string; password: string }) {
  form.username = item.username;
  form.password = item.password;
}

function onForgot() {
  ElMessage.info('请联系系统管理员重置密码');
}

function rememberUsername() {
  if (remember.value) localStorage.setItem(REMEMBER_KEY, form.username);
  else localStorage.removeItem(REMEMBER_KEY);
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  loading.value = true;
  try {
    const user = await userStore.login({ username: form.username, password: form.password });
    rememberUsername();
    ElMessage.success('欢迎回来，' + (user.nickname || user.username));
    const redirect = (route.query.redirect as string) || '/';
    await router.replace(redirect);
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: radial-gradient(120% 120% at 15% 8%, #3A241C 0%, #1B1A17 52%, #141210 100%);
  overflow: hidden;
}

/* 极淡的网格纹理：给深色底一点质感与纵深 */
.login-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.026) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.026) 1px, transparent 1px);
  background-size: 56px 56px;
  -webkit-mask-image: radial-gradient(120% 85% at 50% 42%, #000 22%, transparent 76%);
  mask-image: radial-gradient(120% 85% at 50% 42%, #000 22%, transparent 76%);
  pointer-events: none;
}

.login-glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(96px);
  pointer-events: none;
}
.login-glow--a { width: 560px; height: 560px; top: -160px; left: -140px; background: #C4341B; opacity: 0.46; }
.login-glow--b { width: 500px; height: 500px; bottom: -180px; right: -100px; background: #D99A2B; opacity: 0.28; }

.login-shell {
  position: relative;
  z-index: 1;
  width: min(1040px, 100%);
  display: grid;
  grid-template-columns: 1.02fr 1fr;
  border-radius: 26px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(18px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 44px 90px -44px rgba(0, 0, 0, 0.92);
}
/* 1px 渐变描边：比实线边框更贴合「玻璃卡片」的质感 */
.login-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 3;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.26), rgba(255, 255, 255, 0.06) 42%, rgba(255, 255, 255, 0.02));
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  pointer-events: none;
}

/* ---------------------------------- 左侧品牌区 ---------------------------------- */
.login-brand {
  position: relative;
  padding: 44px 40px;
  display: flex;
  flex-direction: column;
  gap: 30px;
  color: #fff;
  background: linear-gradient(158deg, rgba(196, 52, 27, 0.34), rgba(11, 18, 32, 0.06));
  border-right: 1px solid rgba(255, 255, 255, 0.07);
}
.brand-top { display: flex; align-items: center; gap: 12px; font-weight: 600; letter-spacing: 0.3px; }
.brand-mark {
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: 11px;
  display: grid;
  place-items: center;
  font-size: 18px;
  color: var(--ink-900);
  background: var(--ink-50);
  box-shadow: 0 10px 22px -8px rgba(0, 0, 0, 0.5);
}
.brand-body { flex: 1; display: flex; flex-direction: column; justify-content: center; }
.brand-body h1 { margin: 0 0 14px; font-size: 31px; line-height: 1.34; font-weight: 650; letter-spacing: -0.6px; }
.brand-desc {
  margin: 0 0 28px;
  max-width: 34ch;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13.5px;
  line-height: 1.85;
  text-wrap: pretty;
}
.brand-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.brand-points li {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 11px 13px;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
}
.brand-points li:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.13);
  transform: translateY(-1px);
}
.point-icon {
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 9px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.09);
  color: #F0A794;
  font-size: 14px;
}
.point-text { display: flex; flex-direction: column; }
.point-text strong { font-size: 13.5px; font-weight: 600; }
.point-text em { font-style: normal; color: rgba(255, 255, 255, 0.48); font-size: 12px; margin-top: 1px; }
.brand-foot { color: rgba(255, 255, 255, 0.32); font-size: 12px; }

/* ---------------------------------- 右侧表单区 ---------------------------------- */
.login-panel { background: var(--surface); padding: 46px 44px; display: flex; align-items: center; }
.panel-inner { width: 100%; }
.panel-head { margin-bottom: 24px; }
.panel-head h2 { margin: 0 0 6px; font-size: 23px; font-weight: 650; letter-spacing: -0.3px; color: var(--text-strong); }
.panel-head p { margin: 0; color: var(--text-muted); font-size: 13px; }

.panel-brand { display: none; }

.login-form :deep(.el-form-item) { margin-bottom: 18px; }
.login-form :deep(.el-input__wrapper) {
  border-radius: 12px;
  padding: 3px 14px;
  background: var(--hover-bg);
  box-shadow: 0 0 0 1px var(--line) inset;
  transition: box-shadow 0.18s ease, background 0.18s ease;
}
.login-form :deep(.el-input__wrapper:hover) { box-shadow: 0 0 0 1px var(--text-faint) inset; }
.login-form :deep(.el-input__wrapper.is-focus) {
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--brand-500) inset, 0 0 0 4px rgba(196, 52, 27, 0.15);
}

.login-extras { display: flex; align-items: center; justify-content: space-between; margin: -2px 0 20px; }
.login-extras :deep(.el-checkbox__label) { font-size: 13px; color: var(--text-body); }
.forgot { padding: 0; height: auto; font-size: 13px; }

.submit-item { margin-bottom: 0 !important; }
.login-button {
  width: 100%;
  height: 46px;
  border: none;
  border-radius: 13px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 1px;
  background: linear-gradient(135deg, var(--brand-500), var(--brand-600));
  box-shadow: 0 14px 28px -14px rgba(201, 74, 46, 0.85);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.login-button:hover {
  filter: brightness(1.07);
  transform: translateY(-1px);
  box-shadow: 0 18px 34px -14px rgba(196, 52, 27, 1);
}
.login-button:active { transform: translateY(0); }

/* ---------------------------------- 演示账号 ---------------------------------- */
.demo-box { margin-top: 24px; padding-top: 20px; border-top: 1px dashed var(--line); }
.demo-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 10px;
  color: var(--text-muted);
  font-size: 12px;
}
.demo-title em { font-style: normal; color: var(--text-faint); font-size: 11.5px; }

.demo-row {
  --el-button-bg-color: var(--surface);
  --el-button-border-color: var(--line);
  --el-button-text-color: var(--text-body);
  --el-button-hover-bg-color: var(--chip-brand-bg);
  --el-button-hover-border-color: var(--chip-brand-border);
  --el-button-hover-text-color: var(--chip-brand-text);
  --el-button-active-bg-color: var(--chip-brand-bg);
  --el-button-active-border-color: var(--chip-brand-border);
  --el-button-active-text-color: var(--chip-brand-text);
  display: flex;
  width: 100%;
  height: auto;
  margin: 0 0 7px;
  padding: 9px 12px;
  border-radius: 11px;
  justify-content: flex-start;
  font-weight: 400;
  transition: border-color 0.16s ease, background-color 0.16s ease, transform 0.16s ease;
}
/* el-button 会用一个 span 包住插槽内容，这里把它展开成同一行 flex */
.demo-row :deep(> span) { display: flex; align-items: center; gap: 10px; width: 100%; }
.demo-row + .demo-row { margin-left: 0; }
.demo-row:hover { transform: translateX(2px); }

.demo-role {
  flex: none;
  font-size: 12px;
  font-weight: 600;
  color: var(--chip-brand-text);
  background: var(--chip-brand-bg);
  border: 1px solid var(--chip-brand-border);
  border-radius: 999px;
  padding: 2px 9px;
}
.demo-account { flex: 1; text-align: left; color: var(--text-body); font-size: 12.5px; font-family: var(--font-mono); }
.demo-fill { color: var(--text-faint); font-size: 12px; }

@media (max-width: 900px) {
  .login-page { padding: 20px; }
  .login-shell { grid-template-columns: 1fr; }
  .login-brand { display: none; }
  .login-panel { padding: 34px 24px; }
  .panel-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 24px; }
  .panel-brand .brand-mark { width: 40px; height: 40px; border-radius: 12px; font-size: 20px; }
  .panel-brand-text { display: flex; flex-direction: column; line-height: 1.25; }
  .panel-brand-text strong { font-size: 15px; color: var(--text-strong); }
  .panel-brand-text span { font-size: 11.5px; color: var(--text-muted); }
}
</style>
