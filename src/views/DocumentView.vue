<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ChatLineRound, Collection, Search } from '@element-plus/icons-vue'
import DocumentLibrary from '@/components/knowledge/DocumentLibrary.vue'
import KnowledgeAgentPanel from '@/components/knowledge/KnowledgeAgentPanel.vue'
import RetrievalWorkbench from '@/components/knowledge/RetrievalWorkbench.vue'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useKnowledgeAgentStore } from '@/stores/knowledge-agent'

type KnowledgeTab = 'documents' | 'retrieval' | 'agent'

const activeTab = ref<KnowledgeTab>('documents')
const suggestedQuery = ref('')
const suggestionNonce = ref(0)
const documentStore = useKnowledgeStore()
const agentStore = useKnowledgeAgentStore()

const tabs: Array<{ key: KnowledgeTab; label: string; description: string; icon: typeof Collection }> = [
  { key: 'documents', label: '文档库', description: '检查摄入生命周期', icon: Collection },
  { key: 'retrieval', label: '检索验证', description: '验证资料能否召回', icon: Search },
  { key: 'agent', label: '知识库 Agent', description: '基于证据问答', icon: ChatLineRound },
]

onMounted(() => {
  void documentStore.init()
  agentStore.init()
})

onUnmounted(() => {
  documentStore.dispose()
  agentStore.dispose()
})

function analyzeWithAgent(query: string): void {
  suggestedQuery.value = query
  suggestionNonce.value += 1
  activeTab.value = 'agent'
}
</script>

<template>
  <div class="knowledge-center" data-testid="knowledge-center">
    <header class="knowledge-header">
      <div>
        <div class="eyebrow">KNOWLEDGE OPERATIONS</div>
        <h2>知识中心</h2>
        <p>完成资料摄入、召回验证、证据问答与反馈的可信闭环。</p>
      </div>
      <div class="header-trust">
        <span class="trust-dot" />
        <div>
          <strong>可信呈现</strong>
          <span>未知不等于 0，未完成不等于成功</span>
        </div>
      </div>
    </header>

    <nav class="knowledge-tabs" role="tablist" aria-label="知识中心功能">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.key"
        :class="{ active: activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <el-icon><component :is="tab.icon" /></el-icon>
        <span>
          <strong>{{ tab.label }}</strong>
          <small>{{ tab.description }}</small>
        </span>
      </button>
    </nav>

    <main class="knowledge-content">
      <div v-show="activeTab === 'documents'" role="tabpanel" aria-label="文档库">
        <DocumentLibrary />
      </div>
      <div v-show="activeTab === 'retrieval'" role="tabpanel" aria-label="检索验证">
        <RetrievalWorkbench @analyze="analyzeWithAgent" />
      </div>
      <div v-show="activeTab === 'agent'" role="tabpanel" aria-label="知识库 Agent">
        <KnowledgeAgentPanel
          :active="activeTab === 'agent'"
          :suggested-query="suggestedQuery"
          :suggestion-nonce="suggestionNonce"
        />
      </div>
    </main>
  </div>
</template>

<style scoped>
.knowledge-center { flex: 1; min-height: 0; overflow-y: auto; padding: 26px 30px 34px; color: #14294a; }
.knowledge-header { display: flex; justify-content: space-between; gap: 24px; align-items: center; margin-bottom: 20px; }
.eyebrow { color: #1a6cf0; font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.knowledge-header h2 { margin: 5px 0 0; font-size: 25px; line-height: 1.15; letter-spacing: -.02em; }
.knowledge-header p { color: #7d8ba0; margin: 7px 0 0; font-size: 13px; }
.header-trust { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #e2e8f1; border-radius: 12px; padding: 11px 14px; box-shadow: 0 6px 20px rgba(13,31,60,.04); }
.trust-dot { width: 10px; height: 10px; border-radius: 50%; background: #16a36a; box-shadow: 0 0 0 5px rgba(22,163,106,.1); }
.header-trust div { display: grid; gap: 2px; }
.header-trust strong { color: #263b59; font-size: 12px; }
.header-trust span { color: #8793a6; font-size: 10px; }
.knowledge-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; background: #e9edf4; border-radius: 14px; padding: 5px; margin-bottom: 18px; }
.knowledge-tabs button { appearance: none; display: flex; align-items: center; gap: 10px; text-align: left; color: #6f7d92; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 10px 14px; cursor: pointer; transition: .2s ease; }
.knowledge-tabs button:hover { color: #234a86; }
.knowledge-tabs button.active { color: #1a6cf0; background: #fff; border-color: #dfe6f1; box-shadow: 0 3px 12px rgba(13,31,60,.06); }
.knowledge-tabs .el-icon { font-size: 20px; }
.knowledge-tabs span { display: grid; gap: 2px; }
.knowledge-tabs strong { font-size: 13px; }
.knowledge-tabs small { color: #929daf; font-size: 10px; }
.knowledge-content { min-height: 0; }
@media (max-width: 760px) { .knowledge-center { padding: 18px 14px 26px; } .knowledge-header { align-items: flex-start; flex-direction: column; } .header-trust { width: 100%; box-sizing: border-box; } .knowledge-tabs { overflow-x: auto; grid-template-columns: repeat(3, minmax(150px, 1fr)); } }
</style>
