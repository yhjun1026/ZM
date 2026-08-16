import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { childRoutes, hiddenChildRoutes } from '../config/modules';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('../views/Login.vue') },
    { path: '/debug', name: 'debug', component: () => import('../views/Debug.vue') },
    {
      path: '/',
      component: () => import('../layouts/MainLayout.vue'),
      redirect: '/dashboard',
      children: [...childRoutes, ...hiddenChildRoutes],
    },
  ],
});

// 登录守卫：无 token 跳登录；已登录访问 /login 跳工作台
router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.name === 'login') {
    return auth.token ? { name: 'dashboard' } : true;
  }
  if (!auth.token) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  return true;
});

export default router;
