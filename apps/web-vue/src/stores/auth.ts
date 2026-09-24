import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User, AuthTokens } from '@summit-okr/api-types';
import { authApi } from '@/api';
import { useAppStore } from './app';

export const useAuthStore = defineStore(
  'auth',
  () => {
    const user = ref<User | null>(null);
    const accessToken = ref<string>('');
    const refreshToken = ref<string>('');

    const isAuthenticated = computed(() => !!accessToken.value);

    /** 把服务端保存的主题/语言同步到 app store（登录/注册/刷新资料时调用） */
    function applyUserPrefs(u: User | null) {
      if (!u) return;
      const app = useAppStore();
      app.setTheme(u.preferredTheme);
      app.setLocale(u.preferredLocale);
    }

    async function login(email: string, password: string) {
      const res = await authApi.login({ email, password });
      user.value = res.user;
      accessToken.value = res.accessToken;
      refreshToken.value = res.refreshToken;
      applyUserPrefs(res.user);
      return res;
    }

    async function register(email: string, username: string, password: string) {
      const res = await authApi.register({ email, username, password });
      user.value = res.user;
      accessToken.value = res.accessToken;
      refreshToken.value = res.refreshToken;
      applyUserPrefs(res.user);
      return res;
    }

    async function refresh(): Promise<AuthTokens> {
      if (!refreshToken.value) throw new Error('No refresh token');
      const res = await authApi.refresh({ refreshToken: refreshToken.value });
      accessToken.value = res.accessToken;
      refreshToken.value = res.refreshToken;
      return res;
    }

    async function fetchProfile() {
      const profile = await authApi.profile();
      user.value = profile;
      return profile;
    }

    function logout() {
      user.value = null;
      accessToken.value = '';
      refreshToken.value = '';
    }

    return {
      user,
      accessToken,
      refreshToken,
      isAuthenticated,
      login,
      register,
      refresh,
      fetchProfile,
      logout,
    };
  },
  {
    persist: {
      key: 'summit-okr-auth',
      storage: localStorage,
      paths: ['accessToken', 'refreshToken', 'user'],
    },
  },
);
