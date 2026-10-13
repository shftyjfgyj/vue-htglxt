import type { Directive } from 'vue';
import { useUserStore } from '@/stores/user';

/**
 * v-permission="'user:create'" 或 v-permission="['user:create','user:update']"
 * 无权限时把元素从 DOM 移除（按钮级权限控制）
 */
export const permission: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const store = useUserStore();
    if (!store.hasPermission(binding.value)) {
      el.parentNode?.removeChild(el);
    }
  }
};

export default permission;
