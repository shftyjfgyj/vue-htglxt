import { computed, ref } from 'vue';

export interface ColumnDefault {
  width?: number;
  minWidth?: number;
}

/**
 * 表格列宽记忆：
 * - 用户拖拽列宽后写入 localStorage，下次打开同一张表保持
 * - 以列 label 为键（label 唯一，且比 property 更适合纯展示列）
 * - 未拖拽过的列继续使用声明的 width / minWidth（minWidth 列仍会自适应撑满）
 */
export function useTableColumns(storageKey: string, defaults: Record<string, ColumnDefault>) {
  const STORE_KEY = 'htglxt.table-cols.' + storageKey;

  function load(): Record<string, number> {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  }

  const overrides = ref<Record<string, number>>(load());

  /** 绑定到 el-table-column：v-bind="cols.colProps('标题')" */
  function colProps(label: string) {
    const saved = overrides.value[label];
    if (saved) return { width: saved, minWidth: undefined, resizable: true };
    const def = defaults[label] ?? {};
    return { width: def.width, minWidth: def.minWidth, resizable: true };
  }

  /** 绑定到 el-table：@header-dragend="cols.onHeaderDragend" */
  function onHeaderDragend(newWidth: number, _oldWidth: number, column: { label?: string }) {
    const label = column?.label;
    if (!label || !(label in defaults)) return;
    overrides.value = { ...overrides.value, [label]: Math.round(newWidth) };
    localStorage.setItem(STORE_KEY, JSON.stringify(overrides.value));
  }

  const isCustomized = computed(() => Object.keys(overrides.value).length > 0);

  function reset() {
    localStorage.removeItem(STORE_KEY);
    overrides.value = {};
  }

  return { colProps, onHeaderDragend, reset, isCustomized };
}
