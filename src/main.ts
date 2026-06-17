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
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import './style.css'
import 'katex/dist/katex.min.css'

const app = createApp(App)

// 注册 Element Plus 全局图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })

app.mount('#app')
