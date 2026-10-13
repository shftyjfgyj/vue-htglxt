import { ref, watch } from 'vue';
import { defineStore } from 'pinia';

export type ThemeMode = 'light' | 'dark';
const THEME_KEY = 'htglxt.theme';
const MOBILE_QUERY = '(max-width: 900px)';

/** 首屏渲染前先落地主题，避免亮→暗闪烁（main.ts 也会调用一次） */
export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark');
  document.documentElement.dataset.theme = mode;
}

export function readStoredTheme(): ThemeMode {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const useAppStore = defineStore('app', () => {
  const collapsed = ref(false);
  const theme = ref<ThemeMode>(readStoredTheme());
  const isMobile = ref(window.matchMedia(MOBILE_QUERY).matches);
  const mobileMenuOpen = ref(false);

  applyTheme(theme.value);

  watch(theme, (mode) => {
    applyTheme(mode);
    localStorage.setItem(THEME_KEY, mode);
  });

  // 断点变化时自动收/放侧栏；移动端默认收起
  const media = window.matchMedia(MOBILE_QUERY);
  const onMediaChange = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches;
    mobileMenuOpen.value = false;
    collapsed.value = event.matches;
  };
  media.addEventListener('change', onMediaChange);
  if (isMobile.value) collapsed.value = true;

  function toggleCollapsed() {
    if (isMobile.value) {
      mobileMenuOpen.value = !mobileMenuOpen.value;
      return;
    }
    collapsed.value = !collapsed.value;
  }

  function closeMobileMenu() {
    mobileMenuOpen.value = false;
  }

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  return { collapsed, theme, isMobile, mobileMenuOpen, toggleCollapsed, closeMobileMenu, toggleTheme };
});
