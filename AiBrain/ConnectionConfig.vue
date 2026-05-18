<template>
  <el-card class="card-dark">
    <template #header>
      <span class="section-header">连接配置</span>
    </template>
    <el-form label-position="top" size="small" class="config-form">
      <el-form-item label="服务地址">
        <el-input
          :model-value="serverBase"
          placeholder="http://127.0.0.1:4096"
          :disabled="connecting"
          @update:model-value="$emit('update:serverBase', $event)"
        />
      </el-form-item>
      <el-form-item label="工作目录">
        <el-input
          :model-value="workDir"
          placeholder="D:\your\project"
          :disabled="connecting"
          @update:model-value="$emit('update:workDir', $event)"
        />
      </el-form-item>
      <el-form-item label="密码（可选）">
        <el-input
          :model-value="password"
          type="password"
          placeholder="如未设置可留空"
          show-password
          :disabled="connecting"
          @update:model-value="$emit('update:password', $event)"
        />
      </el-form-item>
      <el-button
        type="primary"
        :loading="connecting"
        class="connect-btn"
        @click="$emit('connect')"
      >
        {{ connected ? '重新连接' : '连接' }}
      </el-button>
      <div v-if="errorMsg" class="err-msg">{{ errorMsg }}</div>
    </el-form>
  </el-card>
</template>

<script setup>
defineProps({
  serverBase: { type: String, default: '' },
  workDir: { type: String, default: '' },
  password: { type: String, default: '' },
  connecting: { type: Boolean, default: false },
  connected: { type: Boolean, default: false },
  errorMsg: { type: String, default: '' },
})

defineEmits(['update:serverBase', 'update:workDir', 'update:password', 'connect'])
</script>

<style scoped>
/* 覆盖 card-dark 的全局 padding，改为仅由 el-card__body 控制 */
.card-dark { padding: 0; }
:deep(.el-card__body) { padding: 10px 12px; }

.config-form :deep(.el-form-item) { margin-bottom: 10px; }
.config-form :deep(.el-form-item__label) {
  color: #a0b4c8;
  font-size: 12px;
  padding-bottom: 2px;
}

.connect-btn { width: 100%; margin-top: 4px; }

.err-msg {
  margin-top: 8px;
  color: #ff4d4f;
  font-size: 12px;
  word-break: break-all;
}
</style>
