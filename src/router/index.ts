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
  ],
})

export default router
