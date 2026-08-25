<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { gatewayApi } from '@/api/algorithm'
import ProxyRuleEditor from '@/components/ProxyRuleEditor.vue'
import type { UrlProxyRule } from '@/types/entities'

// ============================================================
// 接口管理 — openarch_gateway 代理规则管理
//
// 通过网关 /smgr 服务管理接口，对代理规则进行增删改查。
// 编辑采用内联方式（ProxyRuleEditor），保存时对比原始列表，
// 分别对新增 / 修改 / 删除的规则调用对应后端接口。
// ============================================================

const rules = ref<UrlProxyRule[]>([])
const original = ref<UrlProxyRule[]>([])
const loading = ref(false)
const saving = ref(false)

// ---- 路径匹配测试（输入即测，0.5s 防抖） ----
const matchPath = ref('')
const matching = ref(false)
const matchResult = ref<{
  rule: UrlProxyRule | null
  dest: string
  groups: string[]
} | null>(null)
let matchTimer: ReturnType<typeof setTimeout> | null = null

async function runMatch() {
  const path = matchPath.value.trim()
  if (!path) {
    matchResult.value = null
    return
  }
  matching.value = true
  try {
    const [rule, dest, groups] = await gatewayApi.matchRule(path)
    matchResult.value = { rule, dest, groups }
  } catch (e) {
    ElMessage.error(`匹配失败：${(e as Error).message}`)
  } finally {
    matching.value = false
  }
}

/** 输入变化时触发：0.1s 防抖后自动匹配 */
function onMatchInput() {
  if (matchTimer) clearTimeout(matchTimer)
  matchTimer = setTimeout(runMatch, 100)
}

onBeforeUnmount(() => {
  if (matchTimer) clearTimeout(matchTimer)
})

async function fetchRules() {
  loading.value = true
  try {
    const list = await gatewayApi.listRules()
    rules.value = list.map((r) => ({ ...r }))
    original.value = list.map((r) => ({ ...r }))
  } catch (e) {
    ElMessage.error(`获取代理规则失败：${(e as Error).message}`)
  } finally {
    loading.value = false
  }
}

/** 判断两条规则是否等价（忽略顺序，按字段比较） */
function sameRule(a: UrlProxyRule, b: UrlProxyRule): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

async function saveRules() {
  saving.value = true
  try {
    const current = rules.value
    const prev = original.value

    // 删除：存在于原始、但当前已移除的规则
    const removed = prev.filter((p) => !current.some((c) => c.name === p.name))
    // 新增：当前存在、但原始中不存在的规则
    const added = current.filter((c) => !prev.some((p) => p.name === c.name))
    // 修改：两边都存在但内容不同的规则
    const updated = current.filter((c) => {
      const p = prev.find((x) => x.name === c.name)
      return p && !sameRule(p, c)
    })

    for (const r of removed) {
      await gatewayApi.deleteRule(r.name)
    }
    for (const r of added) {
      await gatewayApi.addRule(r)
    }
    for (const r of updated) {
      await gatewayApi.updateRule(r)
    }

    ElMessage.success('代理规则已保存')
    await fetchRules()
  } catch (e) {
    ElMessage.error(`保存失败：${(e as Error).message}`)
  } finally {
    saving.value = false
  }
}

onMounted(fetchRules)
</script>

<template>
  <div class="interface-management">
    <div class="page-header">
      <h2 class="page-title">接口管理</h2>
    </div>

    <div class="content-body">
      <div class="toolbar">
        <div class="toolbar-hint">
          管理网关（openarch_gateway）的代理规则，用于将外部请求转发到各后端服务。
        </div>
        <div class="toolbar-actions">
          <el-button :loading="loading" @click="fetchRules">刷新</el-button>
          <el-button type="primary" :loading="saving" @click="saveRules">保存</el-button>
        </div>
      </div>

      <div class="match-panel">
        <div class="match-title">路径匹配测试</div>
        <div class="match-row">
          <el-input
            v-model="matchPath"
            placeholder="输入 URL 路径，如 /api/aircraft/models"
            clearable
            :loading="matching"
            @input="onMatchInput"
          />
        </div>
        <div v-if="matchResult" class="match-result">
          <div class="match-result-row">
            <span class="match-label">命中规则</span>
            <template v-if="matchResult.rule">
              <el-tag type="success" size="small">{{ matchResult.rule.name }}</el-tag>
              <span class="match-rule-pattern">{{ matchResult.rule.pattern }}</span>
            </template>
            <span v-else class="match-empty">无匹配规则</span>
          </div>
          <div class="match-result-row">
            <span class="match-label">转发目标</span>
            <span class="match-value">{{ matchResult.dest || '无' }}</span>
          </div>
          <div class="match-result-row">
            <span class="match-label">匹配组</span>
            <span class="match-value">
              {{ matchResult.groups?.length ? matchResult.groups.join(', ') : '无' }}
            </span>
          </div>
        </div>
      </div>

      <div class="editor-panel" v-loading="loading">
        <ProxyRuleEditor v-model="rules" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.interface-management {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-header {
  padding: 24px 32px 0;
  flex-shrink: 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0 0 16px;
}

.content-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 32px 32px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 16px;
  flex-shrink: 0;
}

.toolbar-hint {
  font-size: 13px;
  color: #6a7a90;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.editor-panel {
  flex: 1;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 16px;
}

/* ---- 路径匹配测试 ---- */
.match-panel {
  flex-shrink: 0;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}

.match-title {
  font-size: 14px;
  font-weight: 600;
  color: #0d1f3c;
  margin-bottom: 12px;
}

.match-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.match-result {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #eef2f8;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-result-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.match-label {
  color: #6a7a90;
  width: 70px;
  flex-shrink: 0;
}

.match-value {
  color: #0d1f3c;
  word-break: break-all;
}

.match-rule-pattern {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: #6a7a90;
  word-break: break-all;
}

.match-empty {
  color: #bcc5d0;
}
</style>
