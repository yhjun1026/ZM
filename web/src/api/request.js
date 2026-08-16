import axios from 'axios';
import { ElMessage } from 'element-plus';

const request = axios.create({ baseURL: '/api', timeout: 15000 });

// 请求拦截：携带 JWT
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('zm_token');
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

// 响应拦截：成功返回 body；失败统一提示并返回 {success:false}
request.interceptors.response.use(
  (resp) => resp.data,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status === 401) {
      localStorage.removeItem('zm_token');
      localStorage.removeItem('zm_user');
      ElMessage.warning('会话已过期，请重新登录');
      // 懒加载 router 避免循环依赖
      import('../router').then(({ default: router }) => {
        if (router.currentRoute.value.name !== 'login') router.push('/login');
      });
    } else if (status === 403) {
      ElMessage.error(data?.message || data?.msg || '无权限执行此操作');
    } else if (status) {
      ElMessage.error(data?.message || data?.msg || `请求失败 (${status})`);
    } else {
      ElMessage.error(error.message || '网络错误');
    }
    return data || { success: false, message: error.message };
  }
);

export default request;
