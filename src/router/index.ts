import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('@/views/HomeView.vue'),
      children: [
        {
          // 算法管理：/algo 默认进入算法文件页
          path: 'algo',
          name: 'algo',
          redirect: '/algo/files',
        },
        {
          // 算法文件页，:id 为当前选中的算法 id（可选）
          path: 'algo/files/:id?',
          name: 'algo-files',
          component: () => import('@/views/AlgorithmManagement.vue'),
        },
        {
          // 算法配置（模板）页，:id 为当前选中的模板 id（可选）
          path: 'algo/config/:id?',
          name: 'algo-config',
          component: () => import('@/views/AlgorithmManagement.vue'),
        },
        {
          // 运行中算法（实例）页，:id 为当前选中的实例 id（可选）
          path: 'algo/instances/:id?',
          name: 'algo-instances',
          component: () => import('@/views/AlgorithmManagement.vue'),
        },
      ],
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
