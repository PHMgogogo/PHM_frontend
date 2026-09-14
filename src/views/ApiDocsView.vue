<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { ApiReference } from '@scalar/api-reference'
import '@scalar/api-reference/style.css'
import { API_PREFIX } from '@/config/endpoints'

const route = useRoute()
const instanceId = String(route.params.instanceId)
const specContent = ref<Record<string, unknown> | null>(null)

// 自行拉取 OpenAPI 规范，注入正确的 server 地址后再交给 Scalar 渲染
watchEffect(async () => {
  const resp = await fetch(`${API_PREFIX.INSTANCE}/${instanceId}/openapi.json`)
  const raw = await resp.json()
  // 用当前页面 origin 作为服务端地址，前端部署在哪台机器，文档 base url 就是哪台
  const serverBase = `${window.location.origin}${API_PREFIX.INSTANCE}/${instanceId}`
  raw.servers = [{ url: serverBase, description: '当前服务' }]
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
