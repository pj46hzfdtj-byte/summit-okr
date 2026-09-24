import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { ElMessage } from 'element-plus';
import type { ApiResponse } from '@summit-okr/api-types';
import { useAuthStore } from '@/stores/auth';

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截器：自动携带 access token
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const auth = useAuthStore();
  if (auth.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

// 响应拦截器：解构 ApiResponse + 401 自动刷新
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

/** 会话彻底失效：清空队列并跳转登录页（整页重载，保证状态干净） */
function forceRelogin() {
  pendingQueue.forEach((cb) => cb(null));
  pendingQueue = [];
  isRefreshing = false;
  const auth = useAuthStore();
  auth.logout();
  const current = window.location.pathname + window.location.search;
  const target = current.startsWith('/login')
    ? '/login'
    : `/login?redirect=${encodeURIComponent(current)}`;
  if (window.location.pathname + window.location.search !== target) {
    window.location.href = target;
  }
}

http.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse;
    if (data.code === 0) {
      // 拦截器已解包 ApiResponse，运行时返回的是 data.data。
      return data.data as any;
    }
    // 业务错误
    ElMessage.error(data.message || '请求失败');
    return Promise.reject(new Error(data.message));
  },
  async (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status;
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // 401：尝试 refresh token 自动续期
    if (status === 401 && originalRequest && !originalRequest._retry) {
      // 刷新接口自身 401 = refresh token 已失效。
      // 绝不能把它挂进等待队列（否则它等 token、token 等它，永久死锁），
      // 直接判定会话失效并跳转登录。
      if (originalRequest.url?.includes('/auth/refresh')) {
        forceRelogin();
        return Promise.reject(error);
      }

      const auth = useAuthStore();

      if (!auth.refreshToken) {
        forceRelogin();
        return Promise.reject(error);
      }

      // 已在刷新中，挂起到队列
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            originalRequest._retry = true;
            originalRequest.headers!.Authorization = `Bearer ${token}`;
            resolve(http(originalRequest));
          });
        });
      }

      // 触发刷新
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const newTokens = await auth.refresh();
        pendingQueue.forEach((cb) => cb(newTokens.accessToken));
        pendingQueue = [];
        originalRequest.headers!.Authorization = `Bearer ${newTokens.accessToken}`;
        return http(originalRequest);
      } catch (e) {
        forceRelogin();
        ElMessage.warning('登录已过期，请重新登录');
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    // 其他错误
    const message = error.response?.data?.message || error.message || '网络错误';
    ElMessage.error(message);
    return Promise.reject(error);
  },
);

// 运行时拦截器已解包 ApiResponse，各方法实际 resolve 的是业务数据 T。
// 用该类型对外暴露，避免每个调用点重复断言。
export interface TypedHttp {
  request<T = unknown>(config: AxiosRequestConfig): Promise<T>;
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>;
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>;
}

export default http as unknown as TypedHttp;
