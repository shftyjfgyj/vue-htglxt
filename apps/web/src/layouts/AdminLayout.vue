<template>
  <el-container class="admin-layout">
    <!-- 桌面：常驻侧栏 -->
    <el-aside
      v-if="!appStore.isMobile"
      :width="asideWidth"
      class="admin-aside"
      :class="{ 'admin-aside--collapsed': appStore.collapsed }"
    >
      <div class="brand">
        <div class="brand-mark"><el-icon><Platform /></el-icon></div>
        <transition name="fade">
          <div v-if="!appStore.collapsed" class="brand-text">
            <span class="brand-name">后台管理系统<i class="brand-version">v1.0</i></span>
            <span class="brand-sub">Vue3 · Node · MySQL</span>
          </div>
        </transition>
      </div>
      <el-scrollbar class="aside-scroll">
        <SidebarMenu :menus="menus" :active-menu="activeMenu" :collapsed="appStore.collapsed" :badges="badges" />
      </el-scrollbar>
      <div class="aside-footer" :class="{ 'aside-footer--mini': appStore.collapsed }">
        <span class="dot" />
        <template v-if="!appStore.collapsed">
          <span class="footer-text">服务运行中</span>
          <span class="footer-version">v1.0</span>
        </template>
      </div>
    </el-aside>

    <!-- 移动端：抽屉式侧栏 -->
    <el-drawer
      v-else
      v-model="appStore.mobileMenuOpen"
      direction="ltr"
      :with-header="false"
      size="248px"
      class="admin-drawer"
    >
      <div class="admin-aside admin-aside--drawer">
        <div class="brand">
          <div class="brand-mark"><el-icon><Platform /></el-icon></div>
          <div class="brand-text">
            <span class="brand-name">后台管理系统<i class="brand-version">v1.0</i></span>
            <span class="brand-sub">Vue3 · Node · MySQL</span>
          </div>
        </div>
        <el-scrollbar class="aside-scroll">
          <SidebarMenu
            :menus="menus"
            :active-menu="activeMenu"
            :collapsed="false"
            :badges="badges"
            @select="appStore.closeMobileMenu()"
          />
        </el-scrollbar>
      </div>
    </el-drawer>

    <el-container class="main-wrap">
      <el-header class="admin-header">
        <div class="header-left">
          <button class="icon-btn" type="button" :title="appStore.isMobile ? '打开菜单' : '收起/展开侧栏'" @click="appStore.toggleCollapsed()">
            <el-icon><Expand v-if="appStore.collapsed" /><Fold v-else /></el-icon>
          </button>
          <el-breadcrumb v-if="!appStore.isMobile" separator="/">
            <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
          <span v-else class="mobile-title">{{ currentTitle }}</span>
        </div>

        <div class="header-right">
          <button
            class="icon-btn"
            type="button"
            :title="appStore.theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'"
            @click="appStore.toggleTheme()"
          >
            <el-icon><Sunny v-if="appStore.theme === 'dark'" /><Moon v-else /></el-icon>
          </button>
          <NotificationBell />
          <span class="divider" />
          <el-dropdown trigger="click" @command="onCommand">
            <div class="user-chip">
              <el-avatar :size="32" :src="userStore.user?.avatar || undefined" class="user-avatar" :style="avatarVars">
                {{ userStore.displayName.slice(0, 1) }}
              </el-avatar>
              <div class="user-meta">
                <span class="user-name">{{ userStore.displayName }}</span>
                <span class="user-role">{{ userStore.roles.join(' · ') || '未分配角色' }}</span>
              </div>
              <el-icon class="user-caret"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="admin-main">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { ArrowDown, Expand, Fold, Moon, Platform, Sunny, SwitchButton, User } from '@element-plus/icons-vue';
import * as dashboardApi from '@/api/dashboard';
import { fetchMenus } from '@/api/menu';
import NotificationBell from '@/components/NotificationBell.vue';
import SidebarMenu from '@/components/SidebarMenu.vue';
import { useAppStore } from '@/stores/app';
import { useUserStore } from '@/stores/user';
import type { MenuNode } from '@/types';

const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const appStore = useAppStore();
const menus = ref<MenuNode[]>([]);

const activeMenu = computed(() => route.path);
const currentTitle = computed(() => (route.meta.title as string | undefined) ?? '');

/**
 * 头像不再用品牌渐变色块 —— 品牌色留给「动作」，头像用一组低饱和底色，
 * 按角色取色，让它同时是身份的线索（编辑 = 一点红、管理员 = 墨、访客 = 青灰）。
 * 每组的底色/字色都过了 4.5 对比度。
 */
const AVATAR_TONES: Record<string, { bg: string; fg: string }> = {
  super_admin: { bg: '#2A2721', fg: '#F5F1E9' },
  admin: { bg: '#2A2721', fg: '#F5F1E9' },
  editor: { bg: '#F8DCD4', fg: '#8E2312' },
  viewer: { bg: '#DCE6EA', fg: '#2F5A63' }
};
const avatarVars = computed(() => {
  const key = userStore.roles[0] ?? '';
  const tone = AVATAR_TONES[key] ?? { bg: 'var(--ink-100)', fg: 'var(--ink-700)' };
  return { '--avatar-bg': tone.bg, '--avatar-fg': tone.fg };
});
const asideWidth = computed(() => (appStore.collapsed ? 'var(--app-sidebar-collapsed-width)' : 'var(--app-sidebar-width)'));

const badges = ref<Record<string, number>>({});

async function loadMenus() {
  try {
    menus.value = await fetchMenus();
  } catch {
    menus.value = [];
  }
}

/** 侧栏角标：待审核评论 / 待审核文章（无权限时静默忽略） */
async function loadBadges() {
  try {
    const overview = await dashboardApi.fetchOverview();
    badges.value = {
      '/content/comments': overview.pendingComments ?? 0,
      '/content/articles': overview.articles?.pending ?? 0
    };
  } catch {
    badges.value = {};
  }
}

async function onCommand(command: string) {
  if (command === 'profile') {
    void router.push('/profile');
    return;
  }
  if (command === 'logout') {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' });
    await userStore.logout();
    void router.push('/login');
  }
}

onMounted(() => {
  void loadMenus();
  void loadBadges();
});
</script>

<style scoped>
/*
 * 玻璃侧栏背后要有东西可模糊、可透色：环境层放在 .admin-layout 上。
 * 右侧内容区被不透明的 .main-wrap 盖住，因此这层只在左侧 232px 透过侧栏显出来。
 */
.admin-layout {
  height: 100vh;
  position: relative;
  background:
    radial-gradient(560px 470px at 6% 0%, rgba(201, 74, 46, 0.55), transparent 64%),
    radial-gradient(520px 520px at 0% 100%, rgba(110, 27, 13, 0.5), transparent 62%),
    linear-gradient(185deg, var(--sidebar-from) 0%, var(--ink-800) 55%, var(--sidebar-to) 100%);
}

/* ------------------------------- 侧栏 ------------------------------- */
.admin-aside {
  display: flex;
  flex-direction: column;
  /* 毛玻璃：半透明底 + 24px 背景模糊 + 顶部内高光；亮白描边只画右侧这一条 */
  background: var(--sidebar-glass);
  -webkit-backdrop-filter: blur(var(--sidebar-glass-blur)) saturate(165%);
  backdrop-filter: blur(var(--sidebar-glass-blur)) saturate(165%);
  border-right: 1px solid var(--sidebar-edge);
  box-shadow: inset 0 1px 0 var(--sidebar-sheen);
  transition: width 0.24s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}
.admin-aside--drawer {
  height: 100%;
  width: 100%;
  /* 抽屉浮在浅色内容 + 遮罩上，用更实的玻璃，避免变成一块中性灰板 */
  background: var(--sidebar-glass-float);
}
/* 收起态：品牌只留图标并居中，页脚也只留状态点 */
.admin-aside--collapsed .brand { justify-content: center; padding: 0; }
.admin-aside--collapsed .aside-footer { padding: 14px 0 18px; }
.brand {
  height: var(--app-header-height);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 18px;
  position: relative;
  z-index: 1;
  flex: none;
}
.brand-mark {
  width: 34px;
  height: 34px;
  flex: none;
  border-radius: 10px;
  display: grid;
  place-items: center;
  /* logo 不再用品牌渐变：品牌色留给「动作」，方印用浅纸底，在深侧栏上自己就是一块亮面 */
  font-size: 18px;
  color: var(--ink-900);
  background: var(--ink-50);
}
.brand-text { display: flex; flex-direction: column; line-height: 1.2; white-space: nowrap; }
.brand-name { display: inline-flex; align-items: center; gap: 6px; color: #fff; font-size: 15px; font-weight: 600; letter-spacing: 0.2px; }
.brand-version {
  font-style: normal;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0;
  color: #F0A794;
  background: rgba(196, 52, 27, 0.22);
  border: 1px solid rgba(201, 74, 46, 0.35);
  border-radius: 999px;
  padding: 0 6px;
  line-height: 15px;
}
.brand-sub { color: rgba(255, 255, 255, 0.42); font-size: 11px; }
.aside-scroll { flex: 1; min-height: 0; }
.aside-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 18px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}
.aside-footer--mini { justify-content: center; margin: 0 10px; padding: 14px 0 18px; }
.footer-text { flex: 1; }
.footer-version { color: rgba(255, 255, 255, 0.32); font-size: 11px; }
.aside-footer .dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--ok-500);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.2);
}

/* ------------------------------- 顶栏 ------------------------------- */
.main-wrap { background: var(--canvas); min-width: 0; }
.admin-header {
  height: var(--app-header-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 22px;
  background: var(--header-bg);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 10;
}
.header-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
.mobile-title { font-weight: 600; color: var(--text-strong); font-size: 15px; }
.icon-btn {
  width: 34px; height: 34px;
  display: grid; place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.18s ease;
}
.icon-btn:hover { color: var(--chip-brand-text); border-color: var(--chip-brand-border); background: var(--chip-brand-bg); }
.admin-header :deep(.el-breadcrumb__inner),
.admin-header :deep(.el-breadcrumb__separator) { color: var(--text-muted); font-weight: 500; }
.admin-header :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) { color: var(--text-strong); font-weight: 600; }

.header-right { display: flex; align-items: center; gap: 14px; }
.divider { width: 1px; height: 22px; background: var(--line); }
.user-chip {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 10px 5px 5px;
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.18s ease;
}
.user-chip:hover { background: var(--hover-bg); }
.user-avatar { background: var(--avatar-bg, var(--ink-100)); color: var(--avatar-fg, var(--ink-700)); font-weight: 600; }
.user-meta { display: flex; flex-direction: column; line-height: 1.25; }
.user-name { font-size: 13px; font-weight: 600; color: var(--text-strong); }
.user-role { font-size: 11px; color: var(--text-muted); }
.user-caret { color: var(--text-faint); font-size: 12px; }

.admin-main { padding: 0; overflow-y: auto; background: var(--canvas); }

/* ------------------------------- 过渡 ------------------------------- */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.page-enter-active, .page-leave-active { transition: opacity 0.22s ease, transform 0.22s ease; }
.page-enter-from { opacity: 0; transform: translateY(8px); }
.page-leave-to { opacity: 0; transform: translateY(-4px); }

@media (max-width: 900px) {
  .user-meta { display: none; }
  .admin-header { padding: 0 12px; gap: 8px; }
  .header-right { gap: 8px; }
  .divider { display: none; }
}
</style>

<style>
/* 抽屉内的侧栏铺满；抽屉自身透明，让 .admin-aside 的毛玻璃透出遮罩与页面 */
.admin-drawer.el-drawer,
.admin-drawer .el-drawer { background: transparent; }
.admin-drawer .el-drawer__body { padding: 0; background: transparent; }
</style>
