import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPersistedstate from 'pinia-plugin-persistedstate';
import ElementPlus from 'element-plus';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';

import App from './App.vue';
import router from './router';
import i18n, { setI18nLocale } from './i18n';
import './styles/main.scss';

dayjs.locale('zh-cn');

const app = createApp(App);
const pinia = createPinia();
pinia.use(piniaPersistedstate);

app.use(pinia);
app.use(router);
app.use(i18n);
app.use(ElementPlus);

// 应用初始语言（同步 dayjs / html lang）
setI18nLocale(i18n.global.locale.value as any);

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component);
}

app.mount('#app');
