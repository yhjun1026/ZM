import { defineStore } from 'pinia';
import { login as loginApi, logout as logoutApi } from '../api/modules';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('zm_token') || '',
    user: JSON.parse(localStorage.getItem('zm_user') || 'null'),
  }),
  getters: {
    isLoggedIn: (s) => !!s.token,
    userName: (s) => s.user?.name || '',
    userRole: (s) => s.user?.role || '',
    avatar: (s) => s.user?.name?.charAt(0) || '?',
  },
  actions: {
    async login(username, password) {
      const res = await loginApi(username, password);
      if (res.success && res.data?.token) {
        this.token = res.data.token;
        this.user = res.data;
        localStorage.setItem('zm_token', this.token);
        localStorage.setItem('zm_user', JSON.stringify(this.user));
      }
      return res;
    },
    async logout() {
      try {
        await logoutApi();
      } catch {
        /* ignore */
      }
      this.token = '';
      this.user = null;
      localStorage.removeItem('zm_token');
      localStorage.removeItem('zm_user');
    },
  },
});
