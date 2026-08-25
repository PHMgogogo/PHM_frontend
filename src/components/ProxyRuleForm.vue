<script setup lang="ts">
// ============================================================
// 代理规则内联表单（新增 / 编辑共用）
// 包含规则字段 + 单条规则测试面板
// ============================================================

defineProps<{
  form: {
    name: string
    order: number
    rule_type: 'EXACT' | 'PREFIX' | 'REGEX'
    pattern: string
    dest_index: string
    dest_format: string
    rewrite_host: string
    timeout: string
    enable: boolean
    cors: boolean
    editable: boolean
    file_serve_root_path: string
    default_entrance: string
    file_serve_fallback: string
  }
  testPath: string
  testHost: string
  testResult: {
    match: [boolean, string[]]
    dest: string | null
    host: string
    file: string | null
  } | null
  testing: boolean
}>()

defineEmits<{
  (e: 'update:testPath', value: string): void
  (e: 'update:testHost', value: string): void
  (e: 'runTest'): void
}>()
</script>

<template>
  <div class="rule-form">
    <div class="form-row">
      <el-form-item label="规则名称" required>
        <el-input v-model="form.name" placeholder="仅字母/数字/下划线/连字符" />
      </el-form-item>
      <el-form-item label="优先级">
        <el-input-number v-model="form.order" :step="1" />
      </el-form-item>
    </div>

    <div class="form-row">
      <el-form-item label="匹配类型">
        <el-select v-model="form.rule_type" style="width: 100%">
          <el-option label="精确匹配 (EXACT)" value="EXACT" />
          <el-option label="前缀匹配 (PREFIX)" value="PREFIX" />
          <el-option label="正则匹配 (REGEX)" value="REGEX" />
        </el-select>
      </el-form-item>
      <el-form-item label="匹配模式" required>
        <el-input v-model="form.pattern" placeholder="/api/xxx" />
      </el-form-item>
    </div>

    <div class="form-row">
      <el-form-item label="目标索引">
        <el-input v-model="form.dest_index" placeholder="0,1（逗号分隔）" />
      </el-form-item>
      <el-form-item label="目标格式">
        <el-input v-model="form.dest_format" placeholder="%s" />
      </el-form-item>
    </div>

    <div class="form-row">
      <el-form-item label="重写主机">
        <el-input v-model="form.rewrite_host" placeholder="127.0.0.1:8000（留空为文件服务）" />
      </el-form-item>
      <el-form-item label="超时(秒)">
        <el-input-number v-model="form.timeout" :min="0" :step="0.1" placeholder="留空不限制" />
      </el-form-item>
    </div>

    <el-form-item label="文件根路径">
      <el-input v-model="form.file_serve_root_path" placeholder="设置后按静态文件服务，而非反向代理" />
    </el-form-item>

    <div class="form-row">
      <el-form-item label="默认入口">
        <el-input v-model="form.default_entrance" placeholder="/index.html" />
      </el-form-item>
      <el-form-item label="回退文件">
        <el-input v-model="form.file_serve_fallback" placeholder="SPA 路由回退文件" />
      </el-form-item>
    </div>

    <div class="form-row">
      <el-form-item label="启用">
        <el-switch v-model="form.enable" />
      </el-form-item>
      <el-form-item label="CORS">
        <el-switch v-model="form.cors" />
      </el-form-item>
      <el-form-item label="可编辑">
        <el-switch v-model="form.editable" />
      </el-form-item>
    </div>

    <!-- 测试面板 -->
    <div class="test-panel">
      <div class="test-title">规则测试</div>
      <div class="form-row">
        <el-form-item label="测试路径">
          <el-input
            :model-value="testPath"
            placeholder="/api/xxx"
            @update:model-value="$emit('update:testPath', $event)"
            @keyup.enter="$emit('runTest')"
          />
        </el-form-item>
        <el-form-item label="测试主机">
          <el-input
            :model-value="testHost"
            placeholder="留空使用当前域名"
            @update:model-value="$emit('update:testHost', $event)"
            @keyup.enter="$emit('runTest')"
          />
        </el-form-item>
      </div>
      <div class="test-actions">
        <el-button type="primary" size="small" :loading="testing" @click="$emit('runTest')">
          测试规则
        </el-button>
      </div>
      <div v-if="testResult" class="test-result">
        <div class="test-row">
          <span class="test-label">匹配状态</span>
          <el-tag :type="testResult.match[0] ? 'success' : 'danger'" size="small">
            {{ testResult.match[0] ? '成功' : '失败' }}
          </el-tag>
        </div>
        <div class="test-row">
          <span class="test-label">匹配组</span>
          <span class="test-value">{{ testResult.match[1]?.length ? testResult.match[1].join(', ') : '无' }}</span>
        </div>
        <div class="test-row">
          <span class="test-label">目标主机</span>
          <span class="test-value">{{ testResult.host || '无' }}</span>
        </div>
        <div class="test-row">
          <span class="test-label">目标路径</span>
          <span class="test-value">{{ testResult.dest || '无' }}</span>
        </div>
        <div class="test-row">
          <span class="test-label">文件路径</span>
          <span class="test-value">{{ testResult.file || '无' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rule-form .form-row {
  display: flex;
  gap: 12px;
}

.rule-form .form-row .el-form-item {
  flex: 1;
}

.test-panel {
  background: #f7f9fc;
  border: 1px solid #e0e8f5;
  border-radius: 8px;
  padding: 12px;
}

.test-title {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
  margin-bottom: 8px;
}

.test-actions {
  margin-bottom: 8px;
}

.test-result {
  border-top: 1px solid #e0e8f5;
  padding-top: 8px;
}

.test-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 13px;
}

.test-label {
  color: #6a7a90;
  width: 70px;
  flex-shrink: 0;
}

.test-value {
  color: #0d1f3c;
  word-break: break-all;
}
</style>
