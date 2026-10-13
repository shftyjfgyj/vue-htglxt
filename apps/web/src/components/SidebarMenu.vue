<template>
  <div class="aside-body">
    <!-- 菜单筛选：菜单较长时快速定位；收起态不显示 -->
    <div v-if="!collapsed" class="menu-filter">
      <el-input v-model="keyword" size="small" clearable placeholder="搜索菜单" :prefix-icon="Search" />
    </div>

    <el-menu
      :key="keyword.trim() ? 'search' : 'browse'"
      :default-active="activeMenu"
      :default-openeds="openeds"
      :collapse="collapsed"
      :collapse-transition="false"
      class="aside-menu"
      router
      @select="emit('select')"
    >
      <template v-for="(item, index) in filteredMenus" :key="item.id">
        <!-- 一级条目之间加一条细分隔线，长菜单更好扫 -->
        <li v-if="index > 0" class="menu-gap" aria-hidden="true" />

        <el-sub-menu
          v-if="item.children && item.children.length"
          :index="'menu-' + item.id"
          popper-class="aside-menu-popper"
        >
          <template #title>
            <span class="nav-icon"><el-icon><component :is="iconOf(item.icon)" /></el-icon></span>
            <span class="nav-text">{{ item.name }}</span>
          </template>
          <el-menu-item v-for="child in item.children" :key="child.id" :index="child.path || ''">
            <span class="nav-icon nav-icon--sub"><el-icon><component :is="iconOf(child.icon)" /></el-icon></span>
            <span class="nav-text">{{ child.name }}</span>
            <el-badge v-if="badgeOf(child.path)" :value="badgeOf(child.path)" :max="99" class="nav-badge" />
          </el-menu-item>
        </el-sub-menu>

        <el-menu-item v-else :index="item.path || ''">
          <span class="nav-icon"><el-icon><component :is="iconOf(item.icon)" /></el-icon></span>
          <template #title>
            <span class="nav-text">{{ item.name }}</span>
            <el-badge v-if="badgeOf(item.path)" :value="badgeOf(item.path)" :max="99" class="nav-badge" />
          </template>
        </el-menu-item>
      </template>

      <li v-if="menus.length > 0 && filteredMenus.length === 0" class="menu-empty">没有匹配的菜单</li>

      <el-menu-item v-if="menus.length === 0" index="/dashboard">
        <span class="nav-icon"><el-icon><Odometer /></el-icon></span>
        <template #title>数据看板</template>
      </el-menu-item>
    </el-menu>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Avatar, Bell, ChatDotSquare, DataAnalysis, Document, EditPen, Files, Key, Lock, Memo, Odometer, PriceTag,
  Search, Setting, Star, Tickets, User, Warning
} from '@element-plus/icons-vue';
import type { MenuNode } from '@/types';

const ICONS: Record<string, unknown> = {
  Odometer, Document, Memo, Files, PriceTag, ChatDotSquare, Setting, User, Lock, Tickets, Key, Avatar, Star, Bell, EditPen, Warning,
  DataAnalysis
};

const props = defineProps<{
  menus: MenuNode[];
  activeMenu: string;
  collapsed: boolean;
  /** 路径 -> 待处理数量（如待审评论），0 或缺失则不显示角标 */
  badges?: Record<string, number>;
}>();
const emit = defineEmits<{ select: [] }>();

/** 菜单关键词：分组自身命中则整组保留，否则只保留命中的子项 */
const keyword = ref('');

const filteredMenus = computed<MenuNode[]>(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return props.menus;
  return props.menus.reduce<MenuNode[]>((acc, item) => {
    const children = (item.children ?? []).filter((child) => child.name.toLowerCase().includes(kw));
    if (children.length) acc.push({ ...item, children });
    else if (item.name.toLowerCase().includes(kw)) acc.push(item);
    return acc;
  }, []);
});

// 默认展开「当前页面所在的分组」；搜索时全部展开，让命中项直接可见
const openeds = computed(() => {
  if (keyword.value.trim()) {
    return filteredMenus.value.filter((item) => item.children?.length).map((item) => 'menu-' + item.id);
  }
  return props.menus
    .filter((item) => item.children?.some((child) => child.path && props.activeMenu.startsWith(child.path)))
    .map((item) => 'menu-' + item.id);
});

function iconOf(name: string | null) {
  return (name && ICONS[name]) || Memo;
}

function badgeOf(path: string | null) {
  if (!path || !props.badges) return 0;
  return props.badges[path] ?? 0;
}
</script>

<style scoped>
.aside-body { padding-top: 2px; }

/* ---------------------------------- 菜单筛选 ---------------------------------- */
.menu-filter {
  padding: 4px 16px 10px;
}
.menu-filter :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.09);
  box-shadow: none;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  transition: border-color 0.18s ease, background 0.18s ease;
}
.menu-filter :deep(.el-input__wrapper:hover) { border-color: rgba(255, 255, 255, 0.2); }
.menu-filter :deep(.el-input__wrapper.is-focus) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(201, 74, 46, 0.75);
}
.menu-filter :deep(.el-input__inner) { color: #fff; }
.menu-filter :deep(.el-input__inner::placeholder) { color: rgba(255, 255, 255, 0.34); }
.menu-filter :deep(.el-input__prefix),
.menu-filter :deep(.el-input__suffix) { color: rgba(255, 255, 255, 0.4); }

/* ---------------------------------- 菜单主体 ---------------------------------- */
.aside-menu {
  border-right: none;
  background: transparent;
  padding: 4px 12px 18px;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: var(--sidebar-text);
  --el-menu-hover-bg-color: var(--sidebar-hover);
  --el-menu-active-color: #fff;
}

/* 一级菜单/分组标题 */
.aside-menu :deep(.el-menu-item),
.aside-menu :deep(.el-sub-menu__title) {
  position: relative;
  height: 46px;
  line-height: 46px;
  margin: 2px 0;
  border-radius: 12px;
  font-size: 13.5px;
  transition: background-color 0.18s ease, color 0.18s ease;
}
.aside-menu :deep(.el-menu-item:hover),
.aside-menu :deep(.el-sub-menu__title:hover) { color: #fff; }

/* 图标芯片：hover/激活时有一层半透明底 */
.nav-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  margin-right: 10px;
  border-radius: 8px;
  flex: none;
  color: inherit;
  background: rgba(255, 255, 255, 0.06);
  transition: background-color 0.18s ease, color 0.18s ease;
}
.nav-icon :deep(.el-icon) { font-size: 15px; }
.aside-menu :deep(.el-menu-item:hover) .nav-icon,
.aside-menu :deep(.el-sub-menu__title:hover) .nav-icon { background: rgba(255, 255, 255, 0.14); }

.nav-text { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* 一级激活项：品牌渐变 + 侧栏左缘指示条 */
.aside-menu :deep(.el-menu-item.is-active) {
  background: linear-gradient(135deg, var(--brand-500), var(--brand-600));
  color: #fff;
  font-weight: 600;
  box-shadow: 0 12px 24px -14px rgba(201, 74, 46, 0.9);
}
.aside-menu :deep(.el-menu-item.is-active) .nav-icon { background: rgba(255, 255, 255, 0.22); }
.aside-menu :deep(.el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: -12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  border-radius: 0 3px 3px 0;
  background: var(--brand-300);
}

/* 子菜单：缩进 + 引导线。margin-left 33px 让引导线正好落在「一级图标中线」上（12 + 33 = 45） */
.aside-menu :deep(.el-sub-menu .el-menu) {
  padding-left: 6px;
  margin-left: 33px;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}
.aside-menu :deep(.el-sub-menu .el-menu-item) {
  height: 40px;
  line-height: 40px;
  margin: 2px 0;
  padding-left: 12px !important;
  border-radius: 10px;
  font-size: 13px;
}

/* 子项激活：柔和品牌底 + 引导线上的一段高亮（left:-7px 正好压在那条 1px 边框上） */
.aside-menu :deep(.el-sub-menu .el-menu-item.is-active) {
  background: rgba(196, 52, 27, 0.2);
  box-shadow: none;
  color: #fff;
  font-weight: 600;
}
.aside-menu :deep(.el-sub-menu .el-menu-item.is-active) .nav-icon { background: rgba(201, 74, 46, 0.34); }
.aside-menu :deep(.el-sub-menu .el-menu-item.is-active::before) {
  content: '';
  position: absolute;
  left: -7px;
  top: 50%;
  transform: translateY(-50%);
  width: 2px;
  height: 20px;
  border-radius: 2px;
  background: var(--brand-400);
}

.nav-icon--sub {
  width: 20px;
  height: 20px;
  margin-right: 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.045);
}
.nav-icon--sub :deep(.el-icon) { font-size: 12px; }

/* 分组标题的展开箭头更含蓄 */
.aside-menu :deep(.el-sub-menu__title .el-sub-menu__icon-arrow) { font-size: 12px; opacity: 0.5; }
.aside-menu :deep(.el-sub-menu.is-active > .el-sub-menu__title) { color: #fff; }

/* 待处理角标 */
.nav-badge { margin-left: 8px; }
.nav-badge :deep(.el-badge__content) {
  border: none;
  background: linear-gradient(135deg, var(--brand-500), var(--brand-600));
  box-shadow: 0 4px 10px -4px rgba(201, 74, 46, 0.9);
}
/* 激活行上的角标改白底品牌字，避免紫底紫标对比不足 */
.aside-menu :deep(.el-menu-item.is-active) .nav-badge .el-badge__content {
  background: #fff;
  color: var(--brand-600);
  box-shadow: none;
}

/* 一级条目之间的细分隔线 */
.menu-gap {
  list-style: none;
  height: 1px;
  margin: 10px 8px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0));
}

/* 搜索无结果 */
.menu-empty {
  list-style: none;
  padding: 20px 8px;
  text-align: center;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.34);
}

/* ------------------------------- 收起态 ------------------------------- */
.aside-menu.el-menu--collapse { padding: 4px 10px 18px; }
.aside-menu.el-menu--collapse :deep(.el-menu-item),
.aside-menu.el-menu--collapse :deep(.el-sub-menu__title) {
  padding: 0 !important;
  justify-content: center;
}
.aside-menu.el-menu--collapse .nav-icon { margin-right: 0; }
.aside-menu.el-menu--collapse .menu-gap { margin: 8px 4px; }

/*
 * Element Plus 收起时会把它当成「文字」的 span 压成 0×0
 * （.el-menu--collapse > .el-sub-menu > .el-sub-menu__title span）。
 * 我们的图标也是 span，会被一起干掉，表现为「收起后分组图标全部消失」。
 * 这里按更高优先级显式还原图标尺寸。
 */
.aside-menu.el-menu--collapse :deep(.el-menu-item > .nav-icon),
.aside-menu.el-menu--collapse :deep(.el-sub-menu > .el-sub-menu__title > .nav-icon) {
  display: inline-flex;
  width: 26px;
  height: 26px;
  visibility: visible;
  overflow: visible;
}
</style>

<style>
/*
 * 收起态的子菜单浮层会被 teleport 到 body，scoped 样式够不到它，
 * 不处理就会出现「深色侧栏里弹出一块白底菜单」。popper-class 挂在 .el-popper 上，
 * 这里用全局样式补深色主题。
 */
.el-popper.aside-menu-popper {
  --el-menu-bg-color: transparent;
  --el-menu-text-color: rgba(255, 255, 255, 0.72);
  --el-menu-hover-bg-color: rgba(255, 255, 255, 0.08);
  --el-menu-active-color: #fff;
  /* 与侧栏一致的毛玻璃浮层（浮在浅色内容上，用更实的一档） */
  background: var(--sidebar-glass-float);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  backdrop-filter: blur(24px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 12px;
  box-shadow: 0 20px 44px -20px rgba(0, 0, 0, 0.9);
  padding: 6px;
}
.el-popper.aside-menu-popper .el-menu--popup {
  background: transparent;
  border: none;
  padding: 0;
  min-width: 172px;
}
.el-popper.aside-menu-popper .el-menu-item {
  height: 38px;
  line-height: 38px;
  margin: 2px 0;
  border-radius: 9px;
  font-size: 13px;
}
.el-popper.aside-menu-popper .el-menu-item:hover { color: #fff; }
.el-popper.aside-menu-popper .el-menu-item.is-active {
  background: linear-gradient(135deg, var(--brand-500), var(--brand-600));
  color: #fff;
  font-weight: 600;
}
</style>
