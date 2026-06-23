<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { ApiReference } from '@scalar/api-reference'
import '@scalar/api-reference/style.css'

const route = useRoute()
const instanceId = computed(() => String(route.params.instanceId))
// 沿用 /instance 前缀，开发期由 Vite 代理转发到后端
const specUrl = computed(() => `/instance/${instanceId.value}/openapi.json`)
</script>

<template>
  <div class="api-docs-root">
    <ApiReference :configuration="{ url: specUrl }" />
  </div>
</template>

<style scoped>
.api-docs-root {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}
</style>
