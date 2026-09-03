<script setup lang="ts">
import type { SourceDocument } from '@/utils/knowledge-normalize'
import { retrievalScorePresentation } from '@/utils/knowledge-format'

defineProps<{
  modelValue: boolean
  sources: SourceDocument[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    title="回答依据"
    size="min(560px, 92vw)"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="source-intro">
      以下片段由服务随最终回答返回。分数是排序信号，不应直接解释为概率。
    </div>
    <el-empty v-if="sources.length === 0" description="本回答没有返回来源" />
    <div v-else class="source-list">
      <article v-for="(source, index) in sources" :key="`${source.source}-${index}`">
        <header>
          <span class="source-index">{{ index + 1 }}</span>
          <div>
            <strong>{{ source.title || source.source || '未命名来源' }}</strong>
            <p>{{ source.source || '来源文件未提供' }}</p>
          </div>
        </header>
        <p class="source-content">{{ source.content }}</p>
        <div class="source-scores">
          <span>主分数：{{ retrievalScorePresentation(source.score).label }}</span>
          <span>检索：{{ retrievalScorePresentation(source.retrieval_score).label }}</span>
          <span>重排：{{ retrievalScorePresentation(source.rerank_score).label }}</span>
          <el-tag size="small" :type="source.rerank_applied ? 'success' : 'info'" effect="plain">
            {{ source.rerank_applied ? '已重排' : '未重排' }}
          </el-tag>
        </div>
      </article>
    </div>
  </el-drawer>
</template>

<style scoped>
.source-intro { color: #6f7d91; background: #f5f8fc; border-radius: 10px; padding: 11px 13px; font-size: 12px; line-height: 1.55; margin-bottom: 14px; }
.source-list { display: grid; gap: 12px; }
.source-list article { border: 1px solid #e5eaf2; border-radius: 12px; padding: 14px; }
.source-list header { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; }
.source-index { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; color: #1a6cf0; background: #edf4ff; font-size: 11px; font-weight: 700; }
.source-list strong { color: #243653; font-size: 13px; }
.source-list header p { color: #8a96a8; font-size: 11px; margin: 3px 0 0; }
.source-content { color: #42536c; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; font-size: 13px; max-height: 320px; overflow-y: auto; padding: 10px 0; }
.source-scores { display: flex; flex-wrap: wrap; gap: 7px 12px; align-items: center; color: #77859a; font-size: 11px; }
</style>
