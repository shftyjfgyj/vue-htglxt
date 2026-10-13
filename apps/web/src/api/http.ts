import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';
import { useUserStore } from '@/stores/user';
import type { ApiEnvelope, LoginResult } from '@/types';

const baseURL = import.meta.env.VITE_API_BASE_URL || '';

export const http: AxiosInstance = axios.create({ baseURL, timeout: 15000 });

/**
 * 冷启动宽限。
 *
 * Render 这类免费实例空闲 15 分钟会休眠，下一个请求要等约 30~60 秒才响应，
 * 期间网关返回 502/503/504，或者干脆连不上。
 * 用户看到的就是「打开页面一片报错」，其实服务只是在醒。
 *
 * 这里对 GET 做自动等待重试并给出明确提示；写请求不自动重放（避免重复提交）。
 * 生产构建默认开启，本地开发默认关闭（本地后端不存在唤醒问题，重试只会拖慢报错）。
 */
const WAKE_GRACE =
  import.meta.env.PROD
    ? (import.meta.env.VITE_WAKE_GRACE as string | undefined) !== 'off'
    : (import.meta.env.VITE_WAKE_GRACE as string | undefined) === 'on';
const WAKE_STATUS = new Set([502, 503, 504]);
const WAKE_MAX_RETRY = 12;
const WAKE_INTERVAL_MS = 4000;

interface WakeRetryConfig extends AxiosRequestConfig {
  _retry?: boolean;
  _wakeAttempt?: number;
}

let wakingNotice: { close: () => void } | null = null;

function showWakingNotice() {
  if (wakingNotice) return;
  wakingNotice = ElMessage({
    type: 'warning',
    duration: 0,
    showClose: true,
    message: '后端服务正在唤醒（免费实例空闲后会休眠），首次请求约需 30~60 秒，请稍候…'
  });
}

function hideWakingNotice() {
  wakingNotice?.close();
  wakingNotice = null;
}

/** 是否属于「服务在唤醒」而不是真的出错 */
function isWaking(error: { response?: { status?: number }; code?: string }): boolean {
  const status = error.response?.status;
  if (status !== undefined) return WAKE_STATUS.has(status);
  // 连不上或超时：服务可能正在冷启动
  return error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK';
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 刷新令牌的并发去重：多个请求同时 401 只刷新一次 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const store = useUserStore();
  if (!store.refreshToken) return null;
  try {
    const response = await axios.post<ApiEnvelope<LoginResult>>(
      baseURL + '/api/v1/auth/refresh',
      { refreshToken: store.refreshToken }
    );
    if (response.data.code !== 0) return null;
    store.setTokens(response.data.data.accessToken, response.data.data.refreshToken);
    return response.data.data.accessToken;
  } catch {
    return null;
  }
}

http.interceptors.request.use((config) => {
  const store = useUserStore();
  if (store.accessToken) {
    config.headers.Authorization = 'Bearer ' + store.accessToken;
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    // 只要有任何一次成功响应，就说明服务已经醒着，收起唤醒提示
    hideWakingNotice();
    const body = response.data as ApiEnvelope<unknown> | undefined;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      ElMessage.error(body.message || '请求失败');
      return Promise.reject(new Error(body.message || '请求失败'));
    }
    return response;
  },
  async (error) => {
    const status = error.response?.status as number | undefined;
    const original = error.config as WakeRetryConfig | undefined;
    const url: string = original?.url ?? '';

    // 服务冷启动：GET 自动等待重试，写请求交给用户手动重试（避免重复提交）
    if (WAKE_GRACE && original && isWaking(error)) {
      const method = (original.method ?? 'get').toLowerCase();
      const attempt = original._wakeAttempt ?? 0;
      if (method === 'get' && attempt < WAKE_MAX_RETRY) {
        original._wakeAttempt = attempt + 1;
        showWakingNotice();
        await sleep(WAKE_INTERVAL_MS);
        return http.request(original);
      }
      hideWakingNotice();
      ElMessage.error(
        method === 'get'
          ? '后端服务唤醒超时，请稍后刷新页面重试'
          : '后端服务正在唤醒，请等待几秒后重试本次操作'
      );
      return Promise.reject(error);
    }

    // access token 过期：静默刷新后重放一次
    if (status === 401 && original && !original._retry && !url.includes('/auth/refresh')) {
      original._retry = true;
      refreshing = refreshing ?? refreshAccessToken();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers = { ...(original.headers ?? {}), Authorization: 'Bearer ' + token };
        return http.request(original);
      }
      const store = useUserStore();
      store.clear();
      ElMessage.error('登录已过期，请重新登录');
      void router.push({ path: '/login', query: { redirect: router.currentRoute.value.fullPath } });
      return Promise.reject(error);
    }

    const message = (error.response?.data?.message as string) || error.message || '网络异常';
    ElMessage.error(message);
    return Promise.reject(error);
  }
);

export async function request<T>(config: AxiosRequestConfig): Promise<T> {
  const response = await http.request<ApiEnvelope<T>>(config);
  return response.data.data;
}

export function get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>({ url, method: 'GET', params });
}

export function post<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ url, method: 'POST', data });
}

export function put<T>(url: string, data?: unknown): Promise<T> {
  return request<T>({ url, method: 'PUT', data });
}

export function del<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  return request<T>({ url, method: 'DELETE', params });
}
