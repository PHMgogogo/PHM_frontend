import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
    },
    {
      path: '/aircraft/:aircraftNumber',
      name: 'aircraft-workspace',
      component: () => import('@/views/AircraftWorkspace.vue'),
    },
    {
      // 注意：路径不能以 /api、/instance、/task、/opencode 开头，
      // 否则会被 vite.config.ts 里同名的代理前缀拦截转发到后端。
      path: '/algo-docs/:instanceId',
      name: 'algo-docs',
      component: () => import('@/views/ApiDocsView.vue'),
    },
  ],
})

export default router
