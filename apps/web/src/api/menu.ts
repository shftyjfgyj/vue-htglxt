import { get } from './http';
import type { MenuNode } from '@/types';

export function fetchMenus() {
  return get<MenuNode[]>('/api/v1/menus');
}
