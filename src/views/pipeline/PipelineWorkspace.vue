<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref, toRaw, provide, computed } from 'vue'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import Canvas from './components/Canvas.vue';
import Menu from './components/Menu.vue';
import NodeList from './components/NodeList.vue';
import Navigator from './components/Navigator.vue';
import CronPanel from './components/CronPanel.vue';
import LogicFlow from '@logicflow/core'
import { NODE_WIDTH } from "./components/Node.vue"
import type { PipelineData } from './PipelineData.ts';
import Editor from './components/Editor.vue';
import RunResult from './components/RunResult.vue';
import JsonEditorLoading from './components/JsonEditorLoading.vue';
// jsoneditor / katex / markdown-it 只用于 JSON 视图，懒加载避免首屏下载
const JsonEditor = defineAsyncComponent({
  loader: () => import('./components/JsonEditor.vue'),
  loadingComponent: JsonEditorLoading,
})
const PipelineChat = defineAsyncComponent(() => import('./components/PipelineChat.vue'))
import { ElMessage, ElMessageBox } from 'element-plus'
import { _ } from './i18n'
import {
  getPipeline, createPipeline, renamePipeline, deletePipeline, savePipeline, runPipeline, getNodeHelp,
} from '@/api/pipelines'
import {
  listAnalysisPipelines, createAnalysisPipeline, updateAnalysisPipeline, deleteAnalysisPipeline,
} from '@/api/analysisPipeline'

const props = defineProps<{
  aircraftNumber: string
}>()

// ---- 绑定业务：pipeline 在 open_pipeline 后端的存储 id 为 {aircraft_id}_{pipelines_id} ----
function fullPipelineId(pipelineId: string): string {
  return `${props.aircraftNumber}_${pipelineId}`
}

const graphConfigData = ref<LogicFlow.GraphConfigData>({
  nodes: [],
  edges: [
  ]
})
function buildNodesFromPipeline(
  nodesData: PipelineData["nodes"],
  autoLayout: boolean = true,
  cell_width: number = 300,
  cell_height: number = 100,
) {
  let orderGroups: Record<number, typeof nodesData> = {}
  for (let node_id in nodesData) {
    let node = nodesData[node_id]
    let order = node?.order ?? -1
    if (!orderGroups[order]) {
      orderGroups[order] = {}
    }
    orderGroups[order][node_id] = node
  }

  let nodes: any[] = []
  for (let order of Object.keys(orderGroups).map(Number).sort((a, b) => a - b)) {
    let group = orderGroups[order]
    let i = 0
    for (let node_id in group) {
      let node = group[node_id]
      let x = autoLayout ? order * cell_width : (node?.x ?? order * cell_width)
      let y = autoLayout ? i * cell_height : (node?.y ?? i * cell_height)
      nodes.push(
        {
          id: node_id,
          type: "node",
          x,
          y,
          properties: {
            data: node,
            width: NODE_WIDTH
          }
        }
      )
      i++
    }
  }
  return nodes
}

const pipelineList = ref<string[]>([])
const activePipeline = ref("")
const pipelineMeta = ref<Record<string, any>>({})

async function fetchPipelineList() {
  // 通过绑定表获取当前飞机的流水线列表（pipeline_id 为用户输入的 id）
  const bindings = await listAnalysisPipelines(props.aircraftNumber)
  pipelineList.value = (bindings ?? []).map(b => b.pipeline_id)
}

async function onPipelineSelect(id: string | undefined) {
  if (!id) return
  if (id === activePipeline.value) return
  activePipeline.value = id
  selectedNode.value = null
  await editorRef.value?.updateNode(null)
  runResult.value = null
  runError.value = null
  await loadPipeline(id)
  if (viewMode.value === 'json') {
    pipelineJson.value = serializePipeline()
  }
}

async function onPipelineCreate() {
  try {
    const { value } = await ElMessageBox.prompt(_('Please enter pipeline name'), _('New Pipeline'), {
      confirmButtonText: _('OK'),
      cancelButtonText: _('Cancel'),
      inputPattern: /^[A-Za-z0-9_-]+$/,
      inputErrorMessage: _('Only letters, numbers, underscores and hyphens are allowed'),
    })
    if (!value) return
    // 1) 在 open_pipeline 后端创建，存储 id 为 {aircraft_id}_{pipelines_id}
    await createPipeline(fullPipelineId(value))
    // 2) 在绑定表登记 aircraft_id ↔ pipeline_id
    await createAnalysisPipeline({ aircraft_id: props.aircraftNumber, pipeline_id: value })
    await fetchPipelineList()
    await onPipelineSelect(value)
    ElMessage.success(_('Pipeline created'))
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(_('Create failed') + ': ' + e.message)
    }
  }
}

async function onPipelineRename(oldId: string) {
  try {
    const { value } = await ElMessageBox.prompt(_('Please enter new pipeline name'), _('Rename Pipeline'), {
      confirmButtonText: _('OK'),
      cancelButtonText: _('Cancel'),
      inputValue: oldId,
      inputPattern: /^[A-Za-z0-9_-]+$/,
      inputErrorMessage: _('Only letters, numbers, underscores and hyphens are allowed'),
    })
    if (!value || value === oldId) return
    // 1) 重命名 open_pipeline 后端文件
    await renamePipeline(fullPipelineId(oldId), fullPipelineId(value))
    // 2) 更新绑定表记录
    const bindings = await listAnalysisPipelines(props.aircraftNumber)
    const binding = (bindings ?? []).find(b => b.pipeline_id === oldId)
    if (binding) {
      await updateAnalysisPipeline(binding.id, { pipeline_id: value })
    }
    await fetchPipelineList()
    if (activePipeline.value === oldId) {
      activePipeline.value = value
      await loadPipeline(value)
    }
    ElMessage.success(_('Pipeline renamed'))
  } catch (e: any) {
    if (e !== 'cancel') {
      ElMessage.error(_('Rename failed') + ': ' + e.message)
    }
  }
}

async function onPipelineDelete(id: string) {
  try {
    // 1) 删除 open_pipeline 后端文件
    await deletePipeline(fullPipelineId(id))
    // 2) 删除绑定表记录
    const bindings = await listAnalysisPipelines(props.aircraftNumber)
    const binding = (bindings ?? []).find(b => b.pipeline_id === id)
    if (binding) {
      await deleteAnalysisPipeline(binding.id)
    }
    await fetchPipelineList()
    if (activePipeline.value === id) {
      activePipeline.value = ''
      if (pipelineList.value.length > 0) {
        await onPipelineSelect(pipelineList.value[0])
      } else {
        graphConfigData.value = { nodes: [], edges: [] }
        canvasRef.value?.render(graphConfigData)
      }
    }
    ElMessage.success(_('Pipeline deleted'))
  } catch (e: any) {
    ElMessage.error(_('Delete failed') + ': ' + e.message)
  }
}

async function loadPipeline(id: string) {
  let data = await getPipeline<PipelineData>(fullPipelineId(id))
  pipelineMeta.value = { ...data }
  delete pipelineMeta.value.nodes
  let nodes = buildNodesFromPipeline(data.nodes)
  let edges: any[] = []
  let edgeSet = new Set<string>()

  for (let node_id in data.nodes) {
    let node = data.nodes[node_id]
    for (let targetId of [...(node?.next ?? []), ...(node?.prev ?? [])]) {
      let sourceId: string
      if ((node?.next ?? []).includes(targetId)) {
        sourceId = node_id
      } else {
        sourceId = targetId
        targetId = node_id
      }
      let key = `${sourceId}->${targetId}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({
          id: key,
          type: "bezier",
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceAnchorId: `${sourceId}_1`,
          targetAnchorId: `${targetId}_3`,
        })
      }
    }
  }
  graphConfigData.value = { nodes, edges }
  canvasRef.value?.render(graphConfigData)
}
const canvasRef = ref<InstanceType<typeof Canvas>>()
const editorRef = ref<InstanceType<typeof Editor>>()
const selectedNode = ref<{ id: string; properties: Record<string, any> } | null>(null)

async function onNodeSelected(data: { id: string; properties: Record<string, any> } | null) {
  selectedNode.value = data
  await editorRef.value?.updateNode(data?.properties?.data)
}

function updateOrder() {
  const nodes = graphConfigData.value.nodes || []
  const edges = graphConfigData.value.edges || []

  const indegree: Record<string, number> = {}
  const adj: Record<string, string[]> = {}
  for (const node of nodes) {
    const id = node.id!
    indegree[id] = 0
    adj[id] = []
  }
  for (const edge of edges) {
    if (!edge.sourceNodeId || !edge.targetNodeId) continue
    if (!adj[edge.sourceNodeId]) adj[edge.sourceNodeId] = []
    adj[edge.sourceNodeId]!.push(edge.targetNodeId)
    indegree[edge.targetNodeId] = (indegree[edge.targetNodeId] || 0) + 1
  }

  const queue: string[] = []
  for (const id in indegree) {
    if (indegree[id] === 0) queue.push(id)
  }

  const orderMap: Record<string, number> = {}
  let order = 0
  while (queue.length > 0) {
    const nextQueue: string[] = []
    for (const id of queue) {
      orderMap[id] = order
      for (const nextId of adj[id]!) {
        indegree[nextId]!--
        if (indegree[nextId] === 0) {
          nextQueue.push(nextId)
        }
      }
    }
    queue.length = 0
    queue.push(...nextQueue)
    order++
  }

  for (const node of nodes) {
    const id = node.id!
    if (orderMap[id] !== undefined && node.properties?.data) {
      node.properties.data.order = orderMap[id]
    }
  }
}

function onEdgeAdded(data: LogicFlow.EdgeData) {
  graphConfigData.value.edges = [...((graphConfigData.value.edges) || []), data]

  const sourceNode = graphConfigData.value.nodes?.find(n => n.id === data.sourceNodeId)
  const targetNode = graphConfigData.value.nodes?.find(n => n.id === data.targetNodeId)
  if (!sourceNode || !targetNode) return

  const srcData = sourceNode.properties?.data
  const tgtData = targetNode.properties?.data

  if (!srcData.next) srcData.next = []
  if (!tgtData.prev) tgtData.prev = []
  if (!srcData.next.includes(data.targetNodeId)) {
    srcData.next.push(data.targetNodeId)
  }
  if (!tgtData.prev.includes(data.sourceNodeId)) {
    tgtData.prev.push(data.sourceNodeId)
  }
  updateOrder()
  canvasRef.value?.updateNodeProperties(data.sourceNodeId, sourceNode.properties || {})
  canvasRef.value?.updateNodeProperties(data.targetNodeId, targetNode.properties || {})
}

function onEdgeDeleted(data: LogicFlow.EdgeData) {
  const sourceNode = graphConfigData.value.nodes?.find(n => n.id === data.sourceNodeId)
  const targetNode = graphConfigData.value.nodes?.find(n => n.id === data.targetNodeId)
  if (!sourceNode || !targetNode) return

  graphConfigData.value.edges = graphConfigData.value.edges?.filter(e => e.id !== data.id)

  const srcData = sourceNode.properties?.data
  const tgtData = targetNode.properties?.data

  if (srcData.next) {
    srcData.next = srcData.next.filter((id: string) => id !== data.targetNodeId)
  }
  if (tgtData.prev) {
    tgtData.prev = tgtData.prev.filter((id: string) => id !== data.sourceNodeId)
  }
  updateOrder()
  canvasRef.value?.updateNodeProperties(data.sourceNodeId, sourceNode.properties || {})
  canvasRef.value?.updateNodeProperties(data.targetNodeId, targetNode.properties || {})
}

function onNodeDragged({ id, x, y }: { id: string; x: number; y: number }) {
  const node = graphConfigData.value.nodes?.find(n => n.id === id)
  if (node) {
    node.x = x
    node.y = y
  }
}

function onNodeAdded(data: LogicFlow.NodeData) {
  graphConfigData.value.nodes = [...toRaw(graphConfigData.value.nodes || []), data]
}

async function onNodeDeleted(data: LogicFlow.NodeData) {
  const deletedId = data.id!

  for (const node of (graphConfigData.value.nodes || [])) {
    const nodeData = node.properties?.data
    if (!nodeData) continue
    if (nodeData.next) {
      nodeData.next = nodeData.next.filter((id: string) => id !== deletedId)
    }
    if (nodeData.prev) {
      nodeData.prev = nodeData.prev.filter((id: string) => id !== deletedId)
    }
  }

  graphConfigData.value.nodes = (graphConfigData.value.nodes || []).filter(n => n.id !== deletedId)
  graphConfigData.value.edges = (graphConfigData.value.edges || []).filter(
    e => e.sourceNodeId !== deletedId && e.targetNodeId !== deletedId
  )

  if (selectedNode.value?.id === deletedId) {
    selectedNode.value = null
    await editorRef.value?.updateNode(null)
  }
}

function onNodeSaved(data: { id: string; properties: Record<string, any> }) {
  canvasRef.value?.updateNodeProperties(data.id, data.properties)
}

const runResult = ref<{ output: string[]; performance: any[]; data: Record<string, any[]>; state: Record<string, any> } | null>(null)
const runError = ref<{ error: string; error_type: string; traceback: string } | null>(null)
const cronExecutedAt = ref<string | null>(null)
const running = ref(false)
const saving = ref(false)
const activeTab = ref('data')
const outputViewMode = ref<'plain' | 'markdown'>('plain')

async function onRun() {
  running.value = true
  runResult.value = null
  runError.value = null
  cronExecutedAt.value = null

  const nodes: Record<string, any> = {}
  for (const node of (graphConfigData.value.nodes || [])) {
    nodes[node.id ?? ""] = { ...node.properties?.data, x: node.x, y: node.y }
  }

  const pipeline = {
    id: fullPipelineId(activePipeline.value),
    nodes,
  }

  try {
    runResult.value = await runPipeline(pipeline)
    ElMessage.success(_('Pipeline run success'))
  } catch (e: any) {
    runError.value = e?.data ?? null
    ElMessage.error(_('Run failed') + ': ' + e.message)
  } finally {
    running.value = false
  }
}

async function onSave() {
  saving.value = true

  const nodes: Record<string, any> = {}
  for (const node of (graphConfigData.value.nodes || [])) {
    nodes[node.id ?? ""] = { ...node.properties?.data, x: node.x, y: node.y }
  }

  const pipeline = {
    id: fullPipelineId(activePipeline.value),
    nodes,
  }

  try {
    await savePipeline(pipeline)
    ElMessage.success(_('Pipeline save success'))
  } catch (e: any) {
    ElMessage.error(_('Save failed') + ': ' + e.message)
  } finally {
    saving.value = false
  }
}

function onGraphUpdated(data: LogicFlow.GraphConfigData) {
  graphConfigData.value = data
}

function onCronShowContext(data: any) {
  runResult.value = data
  runError.value = null
  cronExecutedAt.value = data.executed_at ?? null
}

function onAutoLayout() {
  updateOrder()
  const nodesData: Record<string, any> = {}
  for (const node of (graphConfigData.value.nodes || [])) {
    nodesData[node.id ?? ""] = { ...node.properties?.data, x: node.x, y: node.y }
  }
  const nodes = buildNodesFromPipeline(nodesData as PipelineData["nodes"], true)
  const edges = (graphConfigData.value.edges || []).map((edge: any) => ({
    id: edge.id,
    type: edge.type || "bezier",
    sourceNodeId: edge.sourceNodeId,
    targetNodeId: edge.targetNodeId,
    sourceAnchorId: edge.sourceAnchorId,
    targetAnchorId: edge.targetAnchorId,
  }))
  graphConfigData.value = { nodes, edges }
  canvasRef.value?.render(graphConfigData)
}

const viewMode = ref<'graph' | 'json'>('graph')
const pipelineJson = ref<object>({})

function serializePipeline(): object {
  const nodes: Record<string, any> = {}
  for (const node of (graphConfigData.value.nodes || [])) {
    nodes[node.id ?? ""] = { ...node.properties?.data, x: node.x, y: node.y }
  }
  return { ...pipelineMeta.value, nodes }
}

function deserializePipeline(json: any) {
  const nodesData = (json?.nodes as Record<string, any>) ?? json ?? {}
  if (json?.nodes) {
    const { nodes, ...meta } = json
    pipelineMeta.value = meta
  }
  const nodes = buildNodesFromPipeline(nodesData as PipelineData["nodes"], false)
  const edges: any[] = []
  const edgeSet = new Set<string>()

  for (const node_id in nodesData) {
    const node = nodesData[node_id]
    for (let targetId of [...(node?.next ?? []), ...(node?.prev ?? [])]) {
      let sourceId: string
      if ((node?.next ?? []).includes(targetId)) {
        sourceId = node_id
      } else {
        sourceId = targetId
        targetId = node_id
      }
      const key = `${sourceId}->${targetId}`
      if (!edgeSet.has(key)) {
        edgeSet.add(key)
        edges.push({
          id: key,
          type: "bezier",
          sourceNodeId: sourceId,
          targetNodeId: targetId,
          sourceAnchorId: `${sourceId}_1`,
          targetAnchorId: `${targetId}_3`,
        })
      }
    }
  }
  graphConfigData.value = { nodes, edges }
  canvasRef.value?.render(graphConfigData)
}

function onToggleView() {
  if (viewMode.value === 'graph') {
    pipelineJson.value = serializePipeline()
    viewMode.value = 'json'
  } else {
    deserializePipeline(pipelineJson.value)
    viewMode.value = 'graph'
  }
}

function onJsonUpdate(val: object) {
  pipelineJson.value = val
}

function onChatPipelineUpdate(val: object) {
  pipelineJson.value = val
  deserializePipeline(val)
}

const md = MarkdownIt().use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'brackets', 'doxygen', 'gitlab'],
})

const nodeHelpCache = new Map<string, string>()
const nodeHelpContent = ref('')
const nodeHelpLoading = ref(false)

async function selectNodeHelp(nodeType: string) {
  if (nodeHelpCache.has(nodeType)) {
    nodeHelpContent.value = md.render(nodeHelpCache.get(nodeType)!)
    return
  }

  nodeHelpLoading.value = true
  nodeHelpContent.value = ''

  try {
    const response = await getNodeHelp(nodeType)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let fullText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.delta) {
              fullText += data.delta
              nodeHelpContent.value = md.render(fullText)
            } else if (data.full) {
              fullText = data.full
              nodeHelpContent.value = md.render(fullText)
              nodeHelpCache.set(nodeType, fullText)
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    }
  } catch (e: any) {
    nodeHelpContent.value = md.render(`**${_('Request failed')}**: ${e.message}`)
  } finally {
    nodeHelpLoading.value = false
  }
}

provide('selectNodeHelp', selectNodeHelp)
provide('nodeHelpContent', nodeHelpContent)
provide('nodeHelpLoading', nodeHelpLoading)

// CronPanel 需要完整的后端 pipeline id
const activeFullPipelineId = computed(() => activePipeline.value ? fullPipelineId(activePipeline.value) : '')

onMounted(async () => {
  await fetchPipelineList()
  if (pipelineList.value.length > 0) {
    await onPipelineSelect(pipelineList.value[0])
  }
})

</script>

<template>
  <div class="app-layout">
    <div class="page-head">
      <div class="page-title">逻辑编排</div>
    </div>
    <div class="main-area">
      <!-- 左列：流水线 + 定时任务 -->
      <div class="left-col">
        <el-card class="block-card nav-card" shadow="never">
          <Navigator :pipelines="pipelineList" :active-id="activePipeline" @select="onPipelineSelect"
            @create="onPipelineCreate" @rename="onPipelineRename" @delete="onPipelineDelete" />
        </el-card>
        <el-card class="block-card cron-card" shadow="never">
          <CronPanel :pipeline-id="activeFullPipelineId" @show-context="onCronShowContext" />
        </el-card>
      </div>
      <!-- 右列：Menu + 编辑器 + 运行结果 -->
      <div class="right-col">
        <Menu @run="onRun" @save="onSave" @auto-layout="onAutoLayout" @toggle-view="onToggleView"
          :running="running" :saving="saving" :view-mode="viewMode" />
        <div class="editor-row">
          <template v-if="viewMode === 'graph'">
            <el-card class="block-card node-card" shadow="never">
              <NodeList :canvas-ref="canvasRef" />
            </el-card>
            <el-card class="block-card canvas-card" shadow="never">
              <Canvas ref="canvasRef" :graph-config-data="graphConfigData" @node-selected="onNodeSelected"
                @edge-added="onEdgeAdded" @edge-deleted="onEdgeDeleted" @node-dragged="onNodeDragged"
                @node-added="onNodeAdded" @node-deleted="onNodeDeleted" @graph-updated="onGraphUpdated" />
            </el-card>
            <el-card class="block-card editor-card" shadow="never">
              <template #header>
                <div class="result-header">
                  <span class="card-title">{{ _('Node Properties') }}</span>
                </div>
              </template>
              <Editor ref="editorRef" :data="selectedNode?.properties?.data" :graph-config-data="graphConfigData"
                :aircraft-number="props.aircraftNumber" @save="onNodeSaved"></Editor>
            </el-card>
          </template>
          <template v-else>
            <el-card class="block-card canvas-card" shadow="never">
              <JsonEditor :json="pipelineJson" @update:json="onJsonUpdate" />
            </el-card>
            <el-card class="block-card editor-card" shadow="never">
              <PipelineChat :pipeline-json="pipelineJson" :pipeline-id="activePipeline" @update:pipeline-json="onChatPipelineUpdate" />
            </el-card>
          </template>
        </div>
        <el-card class="block-card result-card" shadow="never">
          <template #header>
            <div class="result-header">
              <span class="card-title">{{ _('Running Result') }}</span>
              <span v-if="cronExecutedAt" class="cron-executed-at">{{ cronExecutedAt }}</span>
              <div class="result-tabs">
                <el-tabs v-model="activeTab" class="result-tabs-inner">
                  <el-tab-pane :label="_('Data')" name="data" />
                  <el-tab-pane :label="_('State')" name="state" />
                  <el-tab-pane :label="_('Alarm')" name="alarm" />
                  <el-tab-pane :label="_('Output')" name="output" />
                  <el-tab-pane :label="_('Performance')" name="performance" />
                </el-tabs>
                <el-button-group v-if="activeTab === 'output'" size="small" class="output-toggle">
                  <el-button :type="outputViewMode === 'plain' ? 'primary' : 'default'" @click="outputViewMode = 'plain'">{{ _('Plain') }}</el-button>
                  <el-button :type="outputViewMode === 'markdown' ? 'primary' : 'default'" @click="outputViewMode = 'markdown'">{{ _('Markdown') }}</el-button>
                </el-button-group>
              </div>
            </div>
          </template>
          <RunResult :run-result="runResult" :run-error="runError" :running="running"
            :active-tab="activeTab" :output-view-mode="outputViewMode" />
        </el-card>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: clamp(12px, 1.5vw, 16px) clamp(12px, 1.5vw, 20px) clamp(8px, 1vw, 12px);
  flex-shrink: 0;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 0;
}

.main-area {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: clamp(8px, 1vw, 12px);
  padding: 0 clamp(12px, 1.5vw, 20px) clamp(12px, 1.5vw, 20px);
  overflow: hidden;
  background: #f4f6fb;
}

/* 左列：流水线 + 定时任务 */
.left-col {
  width: clamp(150px, 12%, 240px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1vw, 12px);
  min-height: 0;
}

/* 右列：Menu + 编辑器 + 运行结果 */
.right-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: clamp(8px, 1vw, 12px);
  min-height: 0;
}

/* 悬浮卡片块 */
.block-card {
  border-radius: 10px;
  border: 1px solid #e4e8f1;
  background: #fff;
  box-shadow: 0 2px 12px rgba(13, 31, 60, 0.06);
  overflow: hidden;
}

.block-card :deep(> .el-card__body) {
  height: 100%;
  padding: 0;
  overflow: hidden;
}

.nav-card {
  flex: 1;
  min-height: 0;
}

/* 与右列 result-card 等高，使 nav-card 上沿与 Menu 平齐、底边与画布底边平齐 */
.cron-card {
  flex: 0 0 clamp(200px, 34%, 420px);
  min-height: 0;
}

/* 编辑器行：节点列表 + 画布 + 属性编辑 */
.editor-row {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: clamp(8px, 1vw, 12px);
}

.node-card {
  width: clamp(150px, 15%, 220px);
  flex-shrink: 0;
}

.canvas-card {
  flex: 1;
  min-width: 0;
}

.editor-card {
  width: clamp(280px, 32%, 460px);
  flex-shrink: 0;
}

.editor-card :deep(.el-card__header) {
  padding: clamp(8px, 1.2vh, 12px) clamp(10px, 1.2vw, 16px);
  border-bottom: 1px solid #e4e8f1;
}

.editor-card :deep(> .el-card__body) {
  padding: clamp(8px, 1.5vh, 14px) clamp(10px, 1.2vw, 16px);
  overflow-y: auto;
}

.result-card {
  flex: 0 0 clamp(200px, 34%, 420px);
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.result-card :deep(.el-card__header) {
  padding: clamp(8px, 1.2vh, 12px) clamp(10px, 1.2vw, 16px);
  border-bottom: 1px solid #e4e8f1;
  flex-shrink: 0;
}

.result-card :deep(> .el-card__body) {
  padding: clamp(6px, 1vh, 10px) clamp(6px, 0.8vw, 10px);
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.result-header {
  display: flex;
  align-items: center;
  gap: clamp(12px, 1.5vw, 24px);
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #0d1f3c;
  flex-shrink: 0;
}

.cron-executed-at {
  font-size: 13px;
  font-weight: 400;
  color: #909399;
  flex-shrink: 0;
}

.result-tabs {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: clamp(8px, 1vw, 12px);
  min-width: 0;
}

.result-tabs-inner {
  flex-shrink: 0;
}

.result-tabs-inner :deep(.el-tabs__header) {
  margin: 0;
}

.result-tabs-inner :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.output-toggle {
  flex-shrink: 0;
  margin-left: auto;
}
</style>
