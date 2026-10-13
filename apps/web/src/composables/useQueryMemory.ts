import { ref, watch } from 'vue';

/**
 * 列表筛选条件记忆：
 * - 用 sessionStorage（同一标签页内切换菜单后回来仍是上次条件；关标签页即失效，避免长期误导）
 * - 默认不记忆 page（页码可能越界），可用 exclude 追加字段
 * - 恢复后可通过 restored 标记提示用户，并提供 clearMemory() 主动清除
 */
export function useQueryMemory<T extends Record<string, unknown>>(
  key: string,
  query: T,
  options: { exclude?: string[] } = {}
) {
  const STORAGE_KEY = 'htglxt.query.' + key;
  const exclude = new Set(options.exclude ?? ['page']);
  const restored = ref(false);

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, unknown>;
      for (const [field, value] of Object.entries(saved)) {
        if (field in query && !exclude.has(field) && value !== undefined) {
          (query as Record<string, unknown>)[field] = value;
        }
      }
      restored.value = true;
    }
  } catch {
    // 存储损坏时忽略，使用默认筛选
  }

  /**
   * 立即写入（不做防抖）：
   * 筛选字段很少、写入成本极低，而防抖会在「改完条件立刻整页跳转」时丢掉最后一次修改
   * —— E2E 就是这么发现的（点击查询后马上 goto 别的页面，恢复时还是旧条件）。
   */
  function persist() {
    const payload: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(query)) {
      if (!exclude.has(field) && value !== undefined && value !== '') payload[field] = value;
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // 忽略配额异常
    }
  }

  watch(
    () => ({ ...query }),
    () => persist(),
    { deep: true }
  );

  // 整页跳转（非 SPA 路由）时再兜底写一次
  window.addEventListener('pagehide', persist);

  function clearMemory() {
    sessionStorage.removeItem(STORAGE_KEY);
    restored.value = false;
  }

  return { restored, clearMemory };
}