<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { Connection, Search } from '@element-plus/icons-vue'
import { runRetrieval, type RetrievalStrategy } from '@/api/document'
import { ApiError } from '@/api/client'
import type { RetrievalResponse } from '@/utils/knowledge-normalize'
import { retrievalScorePresentation } from '@/utils/knowledge-format'

const emit = defineEmits<{
  analyze: [query: string]
}>()

const query = ref('')
const strategy = ref<RetrievalStrategy>('hybrid')
const topK = ref(5)
const loading = ref(false)
const error = ref('')
const stale = ref(false)
const result = ref<RetrievalResponse | null>(null)
let controller: AbortController | null = null
let requestId = 0

const strategyDescription = computed(() => {
  const descriptions: Record<RetrievalStrategy, string> = {
    hybrid: '向量语义与关键词共同召回，适合一般验证',
    dense: '只比较语义向量，适合同义表达和自然语言',
    sparse: '只使用关键词，适合故障码、编号和精确术语',
  }
  return descriptions[strategy.value]
})

async function search(): Promise<void> {
  const normalizedQuery = query.value.trim()
  if (!normalizedQuery) {
    error.value = '请输入要验证的检索问题'
    return
  }
  const owner = ++requestId
  controller?.abort()
  const requestController = new AbortController()
  controller = requestController
  loading.value = true
  error.value = ''
  try {
    const response = await runRetrieval(
      strategy.value,
      { query: normalizedQuery, top_k: topK.value },
      { signal: requestController.signal },
    )
    if (owner !== requestId) return
    if (response.query !== normalizedQuery) {
      throw new ApiError('检索响应与当前查询不一致', undefined, undefined, 'invalid-response')
    }
    result.value = response
    stale.value = false
  } catch (requestError) {
    if (owner !== requestId) return
    if (requestError instanceof ApiError && requestError.kind === 'cancelled') return
    error.value = requestError instanceof Error ? requestError.message : '检索服务暂时不可用'
    stale.value = result.value !== null
  } finally {
    if (owner === requestId) {
      loading.value = false
      if (controller === requestController) controller = null
    }
  }
}

function handToAgent(): void {
  const verifiedQuery = result.value?.query.trim()
  if (verifiedQuery) emit('analyze', verifiedQuery)
}

onUnmounted(() => {
  requestId += 1
  controller?.abort()
  controller = null
})
</script>

<template>
  <section class="workbench" aria-labelledby="retrieval-title">
    <div class="intro-card">
      <div class="intro-icon"><el-icon><Connection /></el-icon></div>
      <div>
        <h3 id="retrieval-title">低层检索验证</h3>
        <p>直接检查资料能否被召回，不调用 LLM，也不等同于 Agent 的完整检索与证据评估流程。</p>
      </div>
      <el-tag type="info" effect="plain">不调用 LLM</el-tag>
    </div>

    <div class="query-card">
      <el-input
        v-model="query"
        type="textarea"
        :rows="3"
        maxlength="2000"
        show-word-limit
        placeholder="例如：主轴承温度持续升高且伴随振动峰值，资料中有哪些相关说明？"
        @keydown.ctrl.enter.prevent="search"
      />
      <div class="query-controls">
        <div class="strategy-control">
          <el-radio-group v-model="strategy">
            <el-radio-button value="hybrid">混合检索</el-radio-button>
            <el-radio-button value="dense">纯向量</el-radio-button>
            <el-radio-button value="sparse">纯关键词</el-radio-button>
          </el-radio-group>
          <span>{{ strategyDescription }}</span>
        </div>
        <div class="action-control">
          <span class="top-k-label">返回条数</span>
          <el-input-number v-model="topK" :min="1" :max="50" controls-position="right" />
          <el-button type="primary" :icon="Search" :loading="loading" @click="search">
            执行验证
          </el-button>
        </div>
      </div>
    </div>

    <el-alert
      v-if="error"
      :title="error"
      :description="stale ? '下方保留的是上一次成功结果。' : '请检查服务后重试。'"
      type="error"
      :closable="false"
      show-icon
    />

    <div v-if="result" class="result-card" :class="{ stale }" data-testid="retrieval-results">
      <div class="result-heading">
        <div>
          <h3>检索结果</h3>
          <p>
            服务返回 {{ result.total }} 条，用时 {{ result.retrieval_time_ms.toFixed(1) }} ms
            <span v-if="stale"> · 旧结果</span>
          </p>
        </div>
        <el-button type="primary" plain @click="handToAgent">交给 Agent 分析</el-button>
      </div>

      <el-empty v-if="result.results.length === 0" description="未找到匹配证据">
        <p class="empty-help">可以调整术语、切换策略，或把问题交给 Agent 使用完整流程。</p>
      </el-empty>

      <div v-else class="result-list">
        <article v-for="(item, index) in result.results" :key="`${item.source}-${index}`">
          <div class="result-index">{{ index + 1 }}</div>
          <div class="result-content">
            <div class="evidence-title">
              <strong>{{ item.title || item.source || '未命名来源' }}</strong>
              <span>{{ item.source || '来源未提供' }}</span>
            </div>
            <p class="evidence-text">{{ item.content }}</p>
            <div class="score-row">
              <el-tooltip
                content="当前服务可能把缺失主分数也序列化为 0，因此 0 不作为确定相关性。"
              >
                <span :class="`score-${retrievalScorePresentation(item.score, true).kind}`">
                  主分数：{{ retrievalScorePresentation(item.score, true).label }}
                </span>
              </el-tooltip>
              <span>检索分数：{{ retrievalScorePresentation(item.retrieval_score).label }}</span>
              <span>重排分数：{{ retrievalScorePresentation(item.rerank_score).label }}</span>
              <el-tag size="small" :type="item.rerank_applied ? 'success' : 'info'" effect="plain">
                {{ item.rerank_applied ? '已重排' : '未重排' }}
              </el-tag>
            </div>
          </div>
        </article>
      </div>
    </div>

    <div v-else-if="!loading" class="start-state">
      <el-icon><Search /></el-icon>
      <h3>从一个可验证的问题开始</h3>
      <p>结果只代表低层召回，不代表最终答案已经采纳这些证据。</p>
    </div>
  </section>
</template>

<style scoped>
.workbench { display: flex; flex-direction: column; gap: 18px; }
.intro-card, .query-card, .result-card, .start-state { background: #fff; border: 1px solid #e7ecf4; border-radius: 14px; box-shadow: 0 8px 24px rgba(13,31,60,.04); }
.intro-card { display: grid; grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; padding: 18px 20px; }
.intro-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; color: #1a6cf0; background: #edf4ff; font-size: 22px; }
.intro-card h3, .result-heading h3, .start-state h3 { color: #14294a; margin: 0; font-size: 16px; }
.intro-card p, .result-heading p, .start-state p { color: #8491a5; margin: 4px 0 0; font-size: 12px; }
.query-card { padding: 20px; }
.query-controls { display: flex; justify-content: space-between; gap: 20px; align-items: flex-end; margin-top: 14px; }
.strategy-control { display: grid; gap: 7px; }
.strategy-control > span, .top-k-label { color: #8491a5; font-size: 12px; }
.action-control { display: flex; align-items: center; gap: 10px; }
.result-card { padding: 20px; }
.result-card.stale { border-style: dashed; }
.result-heading { display: flex; justify-content: space-between; gap: 16px; align-items: center; margin-bottom: 16px; }
.result-list { display: grid; gap: 12px; }
.result-list article { display: grid; grid-template-columns: 32px 1fr; gap: 12px; padding: 15px; border: 1px solid #e9edf4; border-radius: 12px; }
.result-index { width: 28px; height: 28px; display: grid; place-items: center; color: #1a6cf0; background: #edf4ff; border-radius: 8px; font-size: 12px; font-weight: 700; }
.result-content { min-width: 0; }
.evidence-title { display: flex; flex-wrap: wrap; gap: 8px 14px; align-items: baseline; }
.evidence-title strong { color: #233653; }
.evidence-title span { color: #8b97a9; font-size: 12px; }
.evidence-text { color: #3f5069; font-size: 13px; line-height: 1.75; white-space: pre-wrap; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 7; overflow: hidden; }
.score-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; color: #6f7e93; font-size: 12px; }
.score-ambiguous-zero { color: #a36b10; border-bottom: 1px dotted currentColor; }
.score-unavailable { color: #98a3b4; }
.start-state { min-height: 260px; display: grid; place-content: center; justify-items: center; text-align: center; padding: 30px; }
.start-state > .el-icon { color: #a7b7d0; font-size: 42px; margin-bottom: 12px; }
.empty-help { color: #8995a8; font-size: 12px; }
@media (max-width: 800px) { .query-controls { align-items: stretch; flex-direction: column; } .action-control { flex-wrap: wrap; } .intro-card { grid-template-columns: auto 1fr; } .intro-card > .el-tag { grid-column: 2; justify-self: start; } }
</style>
