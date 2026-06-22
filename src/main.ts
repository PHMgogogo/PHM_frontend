// ============================================================
// 全局事件优化：对 wheel / touch 事件默认启用 passive: true，
// 消除 Element Plus 内部组件（el-input-number、el-scrollbar 等）
// 的 Chrome "non-passive event listener" violation 警告。
// 副作用：依赖 preventDefault() 的处理（如滚轮调整数值）不再
// 阻止页面滚动，但这是与 Chrome 性能建议之间的合理折中。
// ============================================================
;(function patchPassiveListeners() {
  if (typeof window === 'undefined') return
  const original = EventTarget.prototype.addEventListener
  const passiveEvents = new Set(['wheel', 'touchstart', 'touchmove', 'mousewheel'])
  EventTarget.prototype.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    let opts: boolean | AddEventListenerOptions | undefined = options
    if (passiveEvents.has(type)) {
      if (typeof opts === 'boolean') {
        opts = { capture: opts, passive: true }
      } else if (opts === undefined) {
        opts = { passive: true }
      } else if (opts !== null && typeof opts === 'object' && opts.passive === undefined) {
        opts = { ...opts, passive: true }
      }
    }
    return original.call(this, type, listener, opts)
  }
})()

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import './style.css'
import 'katex/dist/katex.min.css'
import 'highlight.js/styles/github.css'

// Element Plus 命令式组件（ElMessage / ElMessageBox / ElNotification / ElLoading）
// 不在模板中，unplugin 按需导入不会为其注入样式，需手动全局导入
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/notification/style/css'
import 'element-plus/es/components/loading/style/css'

const app = createApp(App)

// Element Plus 组件和 CSS 由 unplugin-vue-components / unplugin-auto-import 按需导入
// 设置中文语言包
app.config.globalProperties.$ELEMENT = { locale: zhCn }

app.use(createPinia())
app.use(router)

app.mount('#app')
