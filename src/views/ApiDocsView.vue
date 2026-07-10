<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { ApiReference } from '@scalar/api-reference'
import '@scalar/api-reference/style.css'

const route = useRoute()
const instanceId = String(route.params.instanceId)
const specContent = ref<Record<string, unknown> | null>(null)

// 实际调试用的后端地址
const API_BASE = 'http://172.21.48.1:8001'

// 自行拉取 OpenAPI 规范，注入正确的 server 地址后再交给 Scalar 渲染
watchEffect(async () => {
  const resp = await fetch(`/instance/${instanceId}/openapi.json`)
  const raw = await resp.json()
  // 替换 servers 列表，让 Scalar 的服务器选择器可用
  raw.servers = [
    { url: API_BASE + '/' + instanceId, description: '调试后端 (192.168.31.13:8001)' },
    { url: '/instance/' + instanceId, description: 'Vite 代理 (相对路径)' },
  ]
  specContent.value = raw
})
</script>

<template>
  <div class="api-docs-root">
    <ApiReference
      v-if="specContent"
      :configuration="{ spec: { content: specContent } }"
    />
  </div>
</template>

<style scoped>
.api-docs-root {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow-y: auto;
}
</style>
