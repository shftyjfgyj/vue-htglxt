import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import * as authApi from '@/api/auth';
import type { AuthUser } from '@/types';

const STORAGE_KEY = 'htglxt.auth';

interface Persisted {
  accessToken: string;
  refreshToken: string;
  user: AuthUser | null;
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: '', refreshToken: '', user: null };
    return { accessToken: '', refreshToken: '', user: null, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return { accessToken: '', refreshToken: '', user: null };
  }
}

export const useUserStore = defineStore('user', () => {
  const persisted = loadPersisted();
  const accessToken = ref(persisted.accessToken);
  const refreshToken = ref(persisted.refreshToken);
  const user = ref<AuthUser | null>(persisted.user);

  const isLoggedIn = computed(() => Boolean(accessToken.value));
  const permissions = computed(() => user.value?.permissions ?? []);
  const roles = computed(() => user.value?.roles ?? []);
  const displayName = computed(() => user.value?.nickname || user.value?.username || '未登录');

  /**
   * 本次页面加载是否已从服务端取回最新资料。
   *
   * 本地持久化的快照（localStorage）里带着登录那一刻的权限数组；
   * 管理员事后调整了角色/权限，浏览器不重新登录就永远看不到变化，
   * 菜单与按钮会一直按旧权限显示（曾导致 editor 仍能看到「编辑」他人文章的按钮）。
   * 因此这里标记「本次加载还没刷新过」，由路由守卫在首次进入时强制拉一次 profile。
   */
  const profileFresh = ref(false);

  function persist() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken: accessToken.value, refreshToken: refreshToken.value, user: user.value })
    );
  }

  function setTokens(access: string, refresh: string) {
    accessToken.value = access;
    refreshToken.value = refresh;
    persist();
  }

  function setUser(next: AuthUser | null) {
    user.value = next;
    // 登录接口返回的权限就是最新的，无需再拉一次
    profileFresh.value = Boolean(next);
    persist();
  }

  function clear() {
    accessToken.value = '';
    refreshToken.value = '';
    user.value = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  function hasPermission(code?: string | string[]) {
    if (!code) return true;
    const list = permissions.value;
    if (list.includes('*')) return true;
    const codes = Array.isArray(code) ? code : [code];
    return codes.some((item) => list.includes(item));
  }

  async function login(payload: { username: string; password: string }) {
    const result = await authApi.login(payload);
    setTokens(result.accessToken, result.refreshToken);
    setUser(result.user);
    return result.user;
  }

  async function fetchProfile() {
    const profile = await authApi.fetchProfile();
    setUser(profile);
    profileFresh.value = true;
    return profile;
  }

  async function logout() {
    try {
      await authApi.logout(refreshToken.value);
    } catch {
      // 即便服务端吊销失败，本地也要清干净
    } finally {
      clear();
    }
  }

  return {
    accessToken,
    refreshToken,
    user,
    isLoggedIn,
    permissions,
    roles,
    displayName,
    profileFresh,
    login,
    logout,
    fetchProfile,
    setTokens,
    setUser,
    clear,
    hasPermission
  };
});
