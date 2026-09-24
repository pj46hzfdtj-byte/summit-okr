import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import i18n from '@/i18n';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/auth/LoginPage.vue'),
    meta: { public: true, hidden: true, title: '登录', titleKey: 'nav.login' },
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/auth/RegisterPage.vue'),
    meta: { public: true, hidden: true, title: '注册', titleKey: 'nav.register' },
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    redirect: '/summary',
    children: [
      {
        path: 'summary',
        name: 'Summary',
        component: () => import('@/views/SummaryPage.vue'),
        meta: { title: '摘要', titleKey: 'nav.summary', icon: 'DataAnalysis' },
      },
      {
        path: 'goal-groups',
        name: 'GoalGroups',
        component: () => import('@/views/goal/GoalGroupPage.vue'),
        meta: { title: '目标库', titleKey: 'nav.goals', icon: 'Collection' },
      },
      {
        path: 'objectives/:id',
        name: 'ObjectiveDetail',
        component: () => import('@/views/goal/ObjectiveDetailPage.vue'),
        meta: { title: '目标详情', titleKey: 'objective.detail', hidden: true },
      },
      {
        path: 'focus-cycle',
        name: 'FocusCycle',
        component: () => import('@/views/FocusCyclePage.vue'),
        meta: { title: '专注周期', titleKey: 'nav.focus', icon: 'Aim' },
      },
      {
        path: 'tasks',
        name: 'Tasks',
        component: () => import('@/views/TaskListPage.vue'),
        meta: { title: '日历任务', titleKey: 'nav.tasks', icon: 'Calendar' },
      },
      {
        path: 'gantt',
        name: 'Gantt',
        component: () => import('@/views/GanttPage.vue'),
        meta: { title: '甘特图', titleKey: 'nav.gantt', icon: 'DataLine' },
      },
      {
        path: 'reviews',
        name: 'Reviews',
        component: () => import('@/views/ReviewListPage.vue'),
        meta: { title: '复盘记录', titleKey: 'nav.reviews', icon: 'EditPen' },
      },
      {
        path: 'ai-assistant',
        name: 'AiAssistant',
        component: () => import('@/views/AiAssistantPage.vue'),
        meta: { title: 'AI 助手', titleKey: 'nav.ai', icon: 'MagicStick' },
      },
      {
        path: 'visions',
        name: 'Visions',
        component: () => import('@/views/VisionPage.vue'),
        meta: { title: '愿景', titleKey: 'nav.visions', icon: 'Sunrise' },
      },
      {
        path: 'recycle-bin',
        name: 'RecycleBin',
        component: () => import('@/views/RecycleBinPage.vue'),
        meta: { title: '回收站', titleKey: 'nav.recycle', icon: 'Delete' },
      },
      {
        path: 'help',
        name: 'Help',
        component: () => import('@/views/HelpPage.vue'),
        meta: { title: '帮助与反馈', titleKey: 'nav.help', icon: 'QuestionFilled' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/ProfilePage.vue'),
        meta: { title: '我的', titleKey: 'nav.profile', icon: 'User' },
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/NotFoundPage.vue'),
    meta: { public: true, hidden: true, title: '页面不存在' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 全局前置守卫：鉴权
router.beforeEach((to, from, next) => {
  const auth = useAuthStore();
  const t = i18n.global.t as (key: string) => string;
  const title = to.meta.titleKey ? t(to.meta.titleKey as string) : (to.meta.title as string) ?? 'Summit OKR';
  document.title = `${title} - Summit OKR`;

  if (to.meta.public) {
    // 已登录用户访问 login/register 自动跳转首页
    if (auth.isAuthenticated && (to.name === 'Login' || to.name === 'Register')) {
      next({ name: 'Summary' });
    } else {
      next();
    }
    return;
  }

  if (!auth.isAuthenticated) {
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  next();
});

export default router;
