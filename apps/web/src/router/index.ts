import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useUserStore } from '@/stores/user';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login/LoginView.vue'),
    meta: { title: '登录', public: true }
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/dashboard/DashboardView.vue'),
        meta: { title: '数据看板', icon: 'Odometer', permission: 'dashboard:view' }
      },
      {
        path: 'analytics',
        name: 'analytics',
        component: () => import('@/views/analytics/AnalyticsView.vue'),
        meta: { title: '运营分析', icon: 'DataAnalysis', permission: 'dashboard:view' }
      },
      {
        path: 'system/users',
        name: 'system-users',
        component: () => import('@/views/system/UserView.vue'),
        meta: { title: '用户管理', icon: 'User', permission: 'user:list' }
      },
      {
        path: 'system/roles',
        name: 'system-roles',
        component: () => import('@/views/system/RoleView.vue'),
        meta: { title: '角色权限', icon: 'Lock', permission: 'role:list' }
      },
      {
        path: 'system/sensitive-words',
        name: 'system-sensitive-words',
        component: () => import('@/views/system/SensitiveWordView.vue'),
        meta: { title: '违禁词库', icon: 'Warning', permission: 'sensitive:list' }
      },
      {
        path: 'system/logs/operation',
        name: 'system-logs-operation',
        component: () => import('@/views/system/OperationLogView.vue'),
        meta: { title: '操作日志', icon: 'Tickets', permission: 'log:operation' }
      },
      {
        path: 'system/logs/login',
        name: 'system-logs-login',
        component: () => import('@/views/system/LoginLogView.vue'),
        meta: { title: '登录日志', icon: 'Key', permission: 'log:login' }
      },
      {
        path: 'content/articles',
        name: 'content-articles',
        component: () => import('@/views/content/ArticleListView.vue'),
        meta: { title: '文章管理', icon: 'Memo', permission: 'article:list' }
      },
      {
        path: 'content/articles/new',
        name: 'content-article-create',
        component: () => import('@/views/content/ArticleEditView.vue'),
        meta: { title: '写文章', permission: 'article:create' }
      },
      {
        path: 'content/articles/:id/edit',
        name: 'content-article-edit',
        component: () => import('@/views/content/ArticleEditView.vue'),
        meta: { title: '编辑文章', permission: 'article:update' }
      },
      {
        path: 'content/articles/:id/view',
        name: 'content-article-view',
        component: () => import('@/views/content/ArticleReaderView.vue'),
        meta: { title: '阅读文章', permission: 'article:list' }
      },
      {
        path: 'content/my-articles',
        name: 'content-my-articles',
        component: () => import('@/views/content/MyArticlesView.vue'),
        meta: { title: '我的文章', icon: 'EditPen' }
      },
      {
        path: 'content/feed',
        name: 'content-feed',
        component: () => import('@/views/content/FeedView.vue'),
        meta: { title: '关注动态', icon: 'Bell' }
      },
      {
        path: 'content/categories',
        name: 'content-categories',
        component: () => import('@/views/content/CategoryView.vue'),
        meta: { title: '分类管理', icon: 'Files', permission: 'category:list' }
      },
      {
        path: 'content/tags',
        name: 'content-tags',
        component: () => import('@/views/content/TagView.vue'),
        meta: { title: '标签管理', icon: 'PriceTag', permission: 'tag:list' }
      },
      {
        path: 'content/my-comments',
        name: 'content-my-comments',
        component: () => import('@/views/content/MyCommentsView.vue'),
        meta: { title: '我的评论', icon: 'ChatDotSquare' }
      },
      {
        path: 'content/comments',
        name: 'content-comments',
        component: () => import('@/views/content/CommentView.vue'),
        meta: { title: '全站评论', icon: 'ChatDotSquare', permission: 'comment:manage' }
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/profile/ProfileView.vue'),
        meta: { title: '个人资料', icon: 'Avatar' }
      },
      {
        path: 'profile/library',
        name: 'profile-library',
        component: () => import('@/views/profile/MyLibraryView.vue'),
        meta: { title: '我的收藏', icon: 'Star' }
      },
      {
        path: 'profile/follows',
        name: 'profile-follows',
        component: () => import('@/views/profile/FollowView.vue'),
        meta: { title: '关注管理', icon: 'Star' }
      }
    ]
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/error/ForbiddenView.vue'),
    meta: { title: '无权限', public: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/error/NotFoundView.vue'),
    meta: { title: '页面不存在', public: true }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
});

router.beforeEach(async (to) => {
  document.title = to.meta.title ? to.meta.title + ' - 后台管理系统' : '后台管理系统';
  const store = useUserStore();

  if (to.meta.public) {
    if (to.name === 'login' && store.isLoggedIn) return { path: '/' };
    return true;
  }

  if (!store.isLoggedIn) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }

  // 每次页面加载都从服务端刷新一次资料：
  // localStorage 里的权限快照是登录那一刻的，管理员改过角色/权限后不会自动更新，
  // 菜单和按钮会长期按旧权限显示。这里保证「一次加载 = 一次真实权限」。
  if (!store.profileFresh) {
    try {
      await store.fetchProfile();
    } catch {
      store.clear();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }

  const required = to.meta.permission as string | undefined;
  if (required && !store.hasPermission(required)) {
    return { path: '/403' };
  }
  return true;
});

export default router;
