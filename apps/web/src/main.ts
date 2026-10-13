import { createApp } from 'vue';
import { createPinia } from 'pinia';

// 按需引入：组件与样式由 unplugin-vue-components 的 ElementPlusResolver 自动注册，
// 这里只补全局基础样式与「命令式调用」组件（ElMessage / ElMessageBox / loading）的样式，
// 避免像老系统那样 app.use(ElementPlus) 全量引入（主包 1MB+）。
import 'element-plus/theme-chalk/base.css';
import 'element-plus/theme-chalk/dark/css-vars.css';
import 'element-plus/theme-chalk/el-message.css';
import 'element-plus/theme-chalk/el-message-box.css';
import 'element-plus/theme-chalk/el-loading.css';
import 'element-plus/theme-chalk/el-overlay.css';

import App from './App.vue';
import router from './router';
import permission from './directives/permission';
import { applyTheme, readStoredTheme } from './stores/app';
// 设计令牌（覆盖 Element Plus 变量）必须在基础样式之后、全局样式之前
import './styles/theme.scss';
import './styles/index.scss';

// 首屏渲染前应用主题，避免闪白/闪暗
applyTheme(readStoredTheme());

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.directive('permission', permission);

app.mount('#app');
