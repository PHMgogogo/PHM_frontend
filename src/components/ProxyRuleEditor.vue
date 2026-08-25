<script setup lang="ts">
import { ref, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UrlProxyRule } from '@/types/entities'
import { testProxyRule } from '@/api/algorithm'
import ProxyRuleForm from './ProxyRuleForm.vue'

// ============================================================
// 代理规则（UrlProxyRule）编辑器
//
// 用法：
//   <ProxyRuleEditor v-model="rules" :readonly="false" />
//
// - 展示模式（readonly=true）：仅以卡片展示规则，不可增删改
// - 编辑模式（readonly=false）：内联新增 / 编辑 / 删除，并内置单条规则测试面板
//   编辑采用内联展开（不使用弹窗），默认入口以可点击链接突出展示
// ============================================================

const props = withDefaults(
  defineProps<{
    modelValue: UrlProxyRule[]
    /** 只读模式：仅展示，不提供增删改 */
    readonly?: boolean
  }>(),
  { readonly: false },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: UrlProxyRule[]): void
}>()

const rules = computed<UrlProxyRule[]>({
  get: () => props.modelValue ?? [],
  set: (v) => emit('update:modelValue', v),
})

// ---- 类型映射 ----
const ruleTypeText: Record<string, string> = {
  EXACT: '精确匹配',
  PREFIX: '前缀匹配',
  REGEX: '正则匹配',
}

const ruleTypeTag: Record<string, 'primary' | 'success' | 'warning'> = {
  EXACT: 'primary',
  PREFIX: 'success',
  REGEX: 'warning',
}

// ---- 内联编辑状态 ----
/** 正在编辑的规则下标；null 表示未在编辑 */
const editingIndex = ref<number | null>(null)
const adding = ref(false)

interface RuleForm {
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

const emptyForm = (): RuleForm => ({
  name: '',
  order: -1,
  rule_type: 'PREFIX',
  pattern: '',
  dest_index: '1',
  dest_format: '%s',
  rewrite_host: '',
  timeout: '',
  enable: true,
  cors: false,
  editable: true,
  file_serve_root_path: '',
  default_entrance: '',
  file_serve_fallback: '',
})

const form = ref<RuleForm>(emptyForm())

function startAdd() {
  adding.value = true
  editingIndex.value = null
  form.value = emptyForm()
  resetTest()
}

function startEdit(index: number) {
  const r = rules.value[index]
  if (!r) return
  adding.value = false
  editingIndex.value = index
  form.value = {
    name: r.name ?? '',
    order: r.order ?? -1,
    rule_type: r.rule_type ?? 'PREFIX',
    pattern: r.pattern ?? '',
    dest_index: (r.dest_index ?? []).join(','),
    dest_format: r.dest_format ?? '%s',
    rewrite_host: r.rewrite_host ?? '',
    timeout: r.timeout != null ? String(r.timeout) : '',
    enable: r.enable ?? true,
    cors: r.cors ?? false,
    editable: r.editable ?? true,
    file_serve_root_path: r.file_serve_root_path ?? '',
    default_entrance: r.default_entrance ?? '',
    file_serve_fallback: r.file_serve_fallback ?? '',
  }
  resetTest()
}

function cancelEdit() {
  adding.value = false
  editingIndex.value = null
}

function formToRule(): UrlProxyRule {
  const f = form.value
  const destIndex = f.dest_index
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n))
  return {
    name: f.name.trim(),
    order: f.order,
    rule_type: f.rule_type,
    pattern: f.pattern,
    dest_index: destIndex,
    dest_format: f.dest_format || null,
    rewrite_host: f.rewrite_host.trim() || null,
    timeout: f.timeout ? parseFloat(f.timeout) : null,
    enable: f.enable,
    cors: f.cors,
    editable: f.editable,
    file_serve_root_path: f.file_serve_root_path.trim() || null,
    default_entrance: f.default_entrance.trim() || null,
    file_serve_fallback: f.file_serve_fallback.trim() || null,
  }
}

function saveRule() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请填写规则名称')
    return
  }
  if (!/^[A-Za-z0-9_-]+$/.test(form.value.name.trim())) {
    ElMessage.warning('规则名称仅允许字母、数字、下划线和连字符')
    return
  }
  if (!form.value.pattern.trim()) {
    ElMessage.warning('请填写匹配模式')
    return
  }
  const rule = formToRule()
  const next = [...rules.value]
  if (adding.value) {
    next.push(rule)
  } else if (editingIndex.value != null) {
    next[editingIndex.value] = rule
  }
  rules.value = next
  cancelEdit()
  ElMessage.success(adding.value ? '规则已添加' : '规则已更新')
}

async function removeRule(index: number) {
  const r = rules.value[index]
  if (!r) return
  try {
    await ElMessageBox.confirm(`确定要删除规则"${r.name}"吗？`, '删除确认', {
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    const next = [...rules.value]
    next.splice(index, 1)
    rules.value = next
    ElMessage.success('规则已删除')
  } catch { /* cancelled */ }
}

/** 构造默认入口的完整 URL */
function entranceUrl(rule: UrlProxyRule): string {
  if (!rule.default_entrance) return '#'
  return rule.default_entrance.startsWith('http')
    ? rule.default_entrance
    : `${location.origin}${rule.default_entrance}`
}

// ---- 测试面板 ----
const testPath = ref('')
const testHost = ref('')
const testResult = ref<{
  match: [boolean, string[]]
  dest: string | null
  host: string
  file: string | null
} | null>(null)
const testing = ref(false)

function resetTest() {
  testPath.value = ''
  testHost.value = ''
  testResult.value = null
}

async function runTest() {
  if (!form.value.pattern.trim()) {
    ElMessage.warning('请先填写匹配模式')
    return
  }
  if (!testPath.value.trim()) {
    ElMessage.warning('请输入测试路径')
    return
  }
  testing.value = true
  testResult.value = null
  try {
    const res = await testProxyRule({
      path: testPath.value.trim(),
      host: testHost.value.trim() || location.host,
      upr: formToRule(),
    })
    testResult.value = res
  } catch (e) {
    ElMessage.error(`测试失败：${(e as Error).message}`)
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="proxy-rule-editor">
    <div class="rule-toolbar">
      <el-button v-if="!readonly" type="primary" size="small" @click="startAdd">
        + 添加规则
      </el-button>
    </div>

    <!-- 新增规则（内联表单） -->
    <div v-if="adding" class="rule-card rule-card-editing">
      <div class="rule-card-head">
        <span class="rule-card-title">新增规则</span>
      </div>
      <ProxyRuleForm
        :form="form"
        :test-path="testPath"
        :test-host="testHost"
        :test-result="testResult"
        :testing="testing"
        @update:test-path="testPath = $event"
        @update:test-host="testHost = $event"
        @run-test="runTest"
      />
      <div class="rule-form-actions">
        <el-button size="small" @click="cancelEdit">取消</el-button>
        <el-button type="primary" size="small" @click="saveRule">保存</el-button>
      </div>
    </div>

    <!-- 规则列表 -->
    <div
      v-for="(rule, index) in rules"
      :key="rule.name"
      class="rule-card"
      :class="{ 'rule-card-editing': editingIndex === index }"
    >
      <!-- 展示模式 -->
      <template v-if="editingIndex !== index">
        <div class="rule-summary">
          <div class="rule-header">
            <span class="rule-name">{{ rule.name }}</span>
            <el-tag :type="ruleTypeTag[rule.rule_type] ?? 'info'" size="small" effect="plain">
              {{ ruleTypeText[rule.rule_type] ?? rule.rule_type }}
            </el-tag>
            <el-tag :type="rule.enable ? 'success' : 'info'" size="small">
              {{ rule.enable ? '启用' : '禁用' }}
            </el-tag>
            <span class="rule-order">优先级 {{ rule.order }}</span>
          </div>

          <div class="rule-meta">
            <div class="rule-meta-row">
              <span class="rule-meta-label">匹配模式</span>
              <code class="rule-pattern">{{ rule.pattern }}</code>
            </div>
            <div class="rule-meta-row">
              <span class="rule-meta-label">转发目标</span>
              <span class="rule-dest">
                {{ rule.rewrite_host || '文件服务' }}
                <template v-if="rule.dest_format"> → {{ rule.dest_format }}</template>
              </span>
            </div>
          </div>

          <!-- 默认入口：突出展示 -->
          <div class="rule-entrance">
            <span class="rule-meta-label">默认入口</span>
            <a
              v-if="rule.default_entrance"
              class="rule-entrance-path"
              :href="entranceUrl(rule)"
              target="_blank"
              rel="noopener"
            >{{ rule.default_entrance }}</a>
            <span v-else class="rule-entrance-empty">未设置</span>
          </div>

          <div v-if="!readonly" class="rule-actions">
            <el-button type="primary" text size="small" @click="startEdit(index)">编辑</el-button>
            <el-button type="danger" text size="small" @click="removeRule(index)">删除</el-button>
          </div>
        </div>
      </template>

      <!-- 编辑模式（内联展开） -->
      <template v-else>
        <div class="rule-card-head">
          <span class="rule-card-title">编辑规则：{{ rule.name }}</span>
        </div>
        <ProxyRuleForm
          :form="form"
          :test-path="testPath"
          :test-host="testHost"
          :test-result="testResult"
          :testing="testing"
          @update:test-path="testPath = $event"
          @update:test-host="testHost = $event"
          @run-test="runTest"
        />
        <div class="rule-form-actions">
          <el-button size="small" @click="cancelEdit">取消</el-button>
          <el-button type="primary" size="small" @click="saveRule">保存</el-button>
        </div>
      </template>
    </div>

    <div v-if="rules.length === 0 && !adding" class="rule-empty">
      暂无代理规则
    </div>
  </div>
</template>

<style scoped>
.proxy-rule-editor {
  width: 100%;
}

.rule-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.rule-card {
  border: 1px solid #e0e8f5;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  background: #fff;
}

.rule-card-editing {
  border-color: #1a6cf0;
  background: #f7f9fc;
}

.rule-card-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.rule-card-title {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
}

.rule-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rule-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rule-name {
  font-weight: 600;
  color: #0d1f3c;
  font-size: 14px;
}

.rule-order {
  font-size: 12px;
  color: #6a7a90;
}

.rule-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-meta-label {
  font-size: 12px;
  color: #6a7a90;
  width: 60px;
  flex-shrink: 0;
}

.rule-pattern {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  background: #f0f3f8;
  padding: 2px 6px;
  border-radius: 4px;
}

.rule-dest {
  font-size: 12px;
  color: #0d1f3c;
  word-break: break-all;
}

/* 默认入口：突出展示 */
.rule-entrance {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #eef4ff;
  border: 1px solid #d6e4ff;
  border-radius: 6px;
}

.rule-entrance-path {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: #1a6cf0;
  word-break: break-all;
  text-decoration: none;
  cursor: pointer;
}

.rule-entrance-path:hover {
  text-decoration: underline;
}

.rule-entrance-empty {
  font-size: 12px;
  color: #bcc5d0;
}

.rule-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  border-top: 1px solid #eef2f8;
  padding-top: 8px;
}

.rule-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.rule-empty {
  color: #bcc5d0;
  font-size: 13px;
  text-align: center;
  padding: 16px 0;
}
</style>
