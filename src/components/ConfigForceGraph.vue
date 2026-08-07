<template>
  <div ref="containerEl" class="force-graph">
    <svg ref="svgEl" class="force-svg" :width="width" :height="height">
      <!-- 背景：捕获空白处平移与点击（取消选中） -->
      <rect class="zoom-bg" :width="width" :height="height" @click="clearSelection" />

      <!-- 受 zoom 变换控制的图层 -->
      <g :transform="transformStr">
        <g class="links">
          <line
            v-for="(l, i) in simLinks"
            :key="`l-${i}`"
            class="link"
            :x1="linkX1(l)"
            :y1="linkY1(l)"
            :x2="linkX2(l)"
            :y2="linkY2(l)"
            :stroke-width="hoveredId != null && linkInvolved(l) ? 2.4 : 1.6"
            :opacity="linkOpacity(l)"
          />
        </g>

        <g ref="nodesG" class="nodes">
          <g
            v-for="n in simNodes"
            :key="n.id"
            class="node-group"
            :data-id="n.id"
            :transform="`translate(${n.x},${n.y})`"
            :opacity="nodeOpacity(n)"
            @mouseenter="hoveredId = n.id"
            @mouseleave="hoveredId = null"
          >
            <title>{{ n.item.ataChapter }} · {{ typeLabel(n.type) }}{{ n.item.partNumber ? ` · ${n.item.partNumber}` : '' }}</title>
            <circle
              class="node-circle"
              :class="{ selected: selected?.id === n.id }"
              :r="radiusOf(n.type)"
              :fill="colorOf(n.type)"
            />
            <text class="node-label" :y="radiusOf(n.type) + 14" :font-size="labelSize(n.type)">
              {{ n.label || n.item.ataChapter }}
            </text>
          </g>
        </g>
      </g>
    </svg>

    <!-- 选中节点旁的浮动工具栏（HTML 叠加层，随节点屏幕坐标移动） -->
    <div v-if="selected" class="node-toolbar" :style="toolbarStyle" @click.stop @mousedown.stop>
      <!-- <span class="tb-chip">{{ selected.type === 'MODEL' ? selected.label : selected.item.ataChapter }}</span> -->
      <button v-if="canAddChild" class="tb-btn primary" @click="onAddChild">添加子项</button>
      <button v-if="canDelete" class="tb-btn danger" @click="onDelete">删除</button>
    </div>

    <!-- 视图控制 -->
    <div class="graph-controls">
      <button class="ctl-btn" title="放大" @click="zoomBy(1.25)">＋</button>
      <button class="ctl-btn" title="缩小" @click="zoomBy(0.8)">－</button>
      <button class="ctl-btn" title="重置视图" @click="resetView">重置</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import {
  forceSimulation, forceLink, forceManyBody, forceCenter,
  forceCollide, forceX, forceY, select, zoom, drag, zoomIdentity,
} from 'd3'
import type { D3DragEvent, D3ZoomEvent, Simulation, ForceLink } from 'd3'
import type { ConfigItem, ConfigItemType } from '@/types/entities'

const props = defineProps<{ tree: ConfigItem[]; rootLabel?: string }>()
const emit = defineEmits<{
  (e: 'select', item: ConfigItem | null): void
  (e: 'add-child', item: ConfigItem): void
  (e: 'delete', item: ConfigItem): void
  (e: 'add-root-child'): void
}>()

// ---- 视觉编码 ----
// 虚拟根节点（型号）用 'MODEL' 标识，id 取 -1（真实 itemId 均为正整数，不会冲突）
type NodeType = ConfigItemType | 'MODEL'
const ROOT_ID = -1
const RADIUS: Record<NodeType, number> = { SYSTEM: 22, SUBSYSTEM: 16, EQUIPMENT: 13, LRU: 13, MODEL: 28 }
const COLOR: Record<NodeType, string> = {
  SYSTEM: '#1a6cf0',
  SUBSYSTEM: '#36c4a0',
  EQUIPMENT: '#5a6a7c',
  LRU: '#f5a623',
  MODEL: '#0d1f3c',
}
const TYPE_LABEL: Record<NodeType, string> = {
  SYSTEM: '系统', SUBSYSTEM: '子系统', EQUIPMENT: '设备', LRU: 'LRU', MODEL: '型号',
}

interface SimNode {
  id: number
  item: ConfigItem
  type: NodeType
  label: string
  x: number
  y: number
  fx: number | null
  fy: number | null
}
interface SimLink {
  source: number | SimNode
  target: number | SimNode
}

const radiusOf = (t: NodeType) => RADIUS[t]
const colorOf = (t: NodeType) => COLOR[t]
const typeLabel = (t: NodeType) => TYPE_LABEL[t]
const labelSize = (t: NodeType) => (t === 'SYSTEM' ? 13 : t === 'MODEL' ? 14 : 11)

function nodeLabel(it: ConfigItem): string {
  if (it.itemType === 'SUBSYSTEM') return it.subSystemName ?? ''
  if (it.itemType === 'EQUIPMENT' || it.itemType === 'LRU') return it.equipmentName ?? ''
  return it.systemName ?? ''
}

// ---- DOM / 尺寸 ----
const containerEl = ref<HTMLDivElement>()
const svgEl = ref<SVGSVGElement>()
const nodesG = ref<SVGGElement>()
const width = ref(600)
const height = ref(400)
let ro: ResizeObserver | null = null

// ---- 数据 ----
const simNodes = ref<SimNode[]>([])
const simLinks = ref<SimLink[]>([])
const neighbors = new Map<number, Set<number>>()

const hoveredId = ref<number | null>(null)
const selected = ref<SimNode | null>(null)

const canAddChild = computed(() => {
  const t = selected.value?.type
  return t === 'SYSTEM' || t === 'SUBSYSTEM' || t === 'MODEL'
})
const canDelete = computed(() => selected.value?.type !== 'MODEL')

// ---- zoom / 变换 ----
const zoomTransform = ref({ x: 0, y: 0, k: 1 })
const transformStr = computed(
  () => `translate(${zoomTransform.value.x},${zoomTransform.value.y}) scale(${zoomTransform.value.k})`,
)
const zoomBehavior = zoom<SVGSVGElement, unknown>()
  .scaleExtent([0.3, 3])
  .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
    const t = event.transform
    zoomTransform.value = { x: t.x, y: t.y, k: t.k }
  })

function zoomBy(factor: number) {
  if (!svgEl.value) return
  select(svgEl.value).transition().duration(160).call(zoomBehavior.scaleBy as any, factor)
}
function resetView() {
  if (!svgEl.value) return
  select(svgEl.value).call(zoomBehavior.transform as any, zoomIdentity)
  if (simulation) simulation.alpha(0.8).restart()
}

// ---- 选中 / 工具栏 ----
function selectNode(n: SimNode) {
  selected.value = n
  emit('select', n.item)
}
function clearSelection() {
  if (selected.value) {
    selected.value = null
    emit('select', null)
  }
}
function onAddChild() {
  if (!selected.value) return
  // 根节点（型号）的“添加子项”= 新建顶层项目，交由父级按无父节点处理
  if (selected.value.type === 'MODEL') emit('add-root-child')
  else emit('add-child', selected.value.item)
}
function onDelete() {
  if (selected.value) emit('delete', selected.value.item)
}

const toolbarStyle = computed(() => {
  const n = selected.value
  if (!n) return { display: 'none' }
  const t = zoomTransform.value
  const sx = t.x + n.x * t.k
  const sy = t.y + n.y * t.k
  const r = radiusOf(n.type) * t.k
  return { left: `${sx}px`, top: `${sy - r - 10}px` }
})

// ---- 高亮辅助 ----
function nodeOpacity(n: SimNode) {
  const h = hoveredId.value
  if (h == null) return 1
  if (n.id === h) return 1
  return neighbors.get(h)?.has(n.id) ? 1 : 0.2
}
function linkOpacity(l: SimLink) {
  const h = hoveredId.value
  if (h == null) return 1
  return linkInvolved(l) ? 1 : 0.08
}
function linkInvolved(l: SimLink) {
  const h = hoveredId.value
  if (h == null) return false
  const s = (l.source as SimNode).id
  const t = (l.target as SimNode).id
  return s === h || t === h
}
const linkX1 = (l: SimLink) => (l.source as SimNode).x
const linkY1 = (l: SimLink) => (l.source as SimNode).y
const linkX2 = (l: SimLink) => (l.target as SimNode).x
const linkY2 = (l: SimLink) => (l.target as SimNode).y

// ---- 树扁平化 ----
function flatten(tree: ConfigItem[]) {
  const nodes: SimNode[] = []
  const links: SimLink[] = []
  const w = width.value || 600
  const h = height.value || 400

  // 虚拟根节点：用 selectedModelCode 作为型号根，把所有顶层（无父）项目挂到它下面，
  // 使多根森林收拢成单根树，改善力导向布局并体现 型号 → 系统 → ... 的层级。
  const rootLabel = props.rootLabel?.trim() ?? ''
  if (rootLabel) {
    nodes.push({
      id: ROOT_ID,
      item: {
        itemId: ROOT_ID,
        modelCode: rootLabel,
        parentItemId: null,
        ataChapter: '',
        systemName: rootLabel,
        subSystemName: null,
        equipmentName: null,
        partNumber: null,
        itemType: 'SYSTEM',
        children: [],
      },
      type: 'MODEL',
      label: rootLabel,
      x: w / 2,
      y: h / 2,
      fx: null,
      fy: null,
    })
  }
  const rootParent = rootLabel ? ({ itemId: ROOT_ID } as ConfigItem) : null

  // 连边直接由父子嵌套关系推导（树响应通过 children 表达层级，
  // 嵌套节点的 parentItemId 不一定回填，故不依赖它）
  const walk = (items: ConfigItem[], parent: ConfigItem | null) => {
    for (const it of items) {
      nodes.push({
        id: it.itemId,
        item: it,
        type: it.itemType,
        label: nodeLabel(it),
        x: w / 2 + (Math.random() - 0.5) * 140,
        y: h / 2 + (Math.random() - 0.5) * 140,
        fx: null,
        fy: null,
      })
      if (parent) {
        links.push({ source: parent.itemId, target: it.itemId })
      }
      if (it.children?.length) walk(it.children, it)
    }
  }
  walk(tree, rootParent)
  return { nodes, links }
}

function buildAdjacency(links: SimLink[]) {
  neighbors.clear()
  for (const n of simNodes.value) neighbors.set(n.id, new Set())
  for (const l of links) {
    const s = l.source as number
    const t = l.target as number
    neighbors.get(s)?.add(t)
    neighbors.get(t)?.add(s)
  }
}

// ---- 仿真 ----
let simulation: Simulation<SimNode, undefined> | null = null
let dragMoved = false
let dragOrigin = { x: 0, y: 0 }

const dragBehavior = drag<SVGGElement, SimNode>()
  .on('start', (event: D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
    dragMoved = false
    dragOrigin = { x: event.x, y: event.y }
    if (!event.active) simulation?.alphaTarget(0.3).restart()
    d.fx = d.x
    d.fy = d.y
  })
  .on('drag', (event: D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
    if (Math.abs(event.x - dragOrigin.x) > 3 || Math.abs(event.y - dragOrigin.y) > 3) dragMoved = true
    d.fx = event.x
    d.fy = event.y
  })
  .on('end', (event: D3DragEvent<SVGGElement, SimNode, SimNode>, d: SimNode) => {
    if (!event.active) simulation?.alphaTarget(0)
    if (!dragMoved) selectNode(d)
    d.fx = null
    d.fy = null
  })

function attachDrag() {
  if (!nodesG.value) return
  const els = nodesG.value.querySelectorAll<SVGGElement>('.node-group')
  const byId = new Map(simNodes.value.map((n) => [n.id, n]))
  els.forEach((el) => {
    const n = byId.get(Number(el.getAttribute('data-id')))
    if (n) (el as unknown as { __data__: SimNode }).__data__ = n
  })
  select(nodesG.value).selectAll<SVGGElement, SimNode>('.node-group').call(dragBehavior)
}

function rebuild() {
  const { nodes, links } = flatten(props.tree)
  simNodes.value = nodes
  simLinks.value = links
  buildAdjacency(links)
  // 重建后把选中态指向新的节点对象，保证位置随仿真实时更新
  if (selected.value) {
    selected.value = nodes.find((n) => n.id === selected.value!.id) ?? null
  }

  const w = width.value || 600
  const h = height.value || 400
  if (!simulation) {
    simulation = forceSimulation<SimNode>(simNodes.value)
      .force('link', forceLink<SimNode, SimLink>(simLinks.value).id((d) => d.id).distance(90).strength(0.5))
      .force('charge', forceManyBody<SimNode>().strength(-420))
      .force('center', forceCenter<SimNode>(w / 2, h / 2))
      .force('collide', forceCollide<SimNode>().radius((d) => radiusOf(d.type) + 10))
      .force('x', forceX<SimNode>(w / 2).strength(0.045))
      .force('y', forceY<SimNode>(h / 2).strength(0.06))
  } else {
    simulation.nodes(simNodes.value)
    const linkForce = simulation.force('link') as ForceLink<SimNode, SimLink> | undefined
    linkForce?.links(simLinks.value)
    simulation.alpha(1).restart()
  }
  nextTick(attachDrag)
}

watch([width, height], ([w, h]) => {
  if (!simulation) return
  ;(simulation.force('center') as { x: (v: number) => unknown } | undefined)?.x?.(w / 2)
  ;(simulation.force('center') as { y: (v: number) => unknown } | undefined)?.y?.(h / 2)
  ;(simulation.force('x') as { x: (v: number) => unknown } | undefined)?.x?.(w / 2)
  ;(simulation.force('y') as { y: (v: number) => unknown } | undefined)?.y?.(h / 2)
  simulation.alpha(0.3).restart()
})

watch([() => props.tree, () => props.rootLabel], () => rebuild(), { deep: false })

onMounted(() => {
  if (containerEl.value) {
    const rect = containerEl.value.getBoundingClientRect()
    width.value = rect.width || 600
    height.value = rect.height || 400
    ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r && r.width > 0 && r.height > 0) {
        width.value = r.width
        height.value = r.height
      }
    })
    ro.observe(containerEl.value)
  }
  if (svgEl.value) {
    select(svgEl.value).call(zoomBehavior as any)
  }
  rebuild()
})

onBeforeUnmount(() => {
  simulation?.stop()
  ro?.disconnect()
})
</script>

<style scoped>
.force-graph {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #fff;
}

.force-svg {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}
.force-svg:active {
  cursor: grabbing;
}

.zoom-bg {
  fill: transparent;
}

.link {
  stroke: #94a3b8;
  transition: opacity 0.15s, stroke-width 0.15s;
}

.node-group {
  cursor: pointer;
  transition: opacity 0.15s;
}

.node-circle {
  stroke: #fff;
  stroke-width: 2;
  transition: stroke 0.12s, stroke-width 0.12s, filter 0.12s;
}
.node-circle.selected {
  stroke: #1a6cf0;
  stroke-width: 4;
  filter: drop-shadow(0 2px 6px rgba(26, 108, 240, 0.45));
}
.node-group:hover .node-circle {
  filter: drop-shadow(0 2px 5px rgba(0, 0, 0, 0.18));
}

.node-label {
  fill: #0d1f3c;
  text-anchor: middle;
  pointer-events: none;
  font-weight: 500;
  user-select: none;
}

/* 浮动工具栏 */
.node-toolbar {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: #fff;
  border: 1px solid #e0e8f5;
  border-radius: 8px;
  padding: 5px 6px;
  box-shadow: 0 6px 20px rgba(13, 31, 60, 0.16);
  white-space: nowrap;
  z-index: 5;
}
.node-toolbar::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: #fff;
  border-right: 1px solid #e0e8f5;
  border-bottom: 1px solid #e0e8f5;
}
.tb-chip {
  font-size: 12px;
  color: #1a6cf0;
  font-weight: 600;
  padding: 0 6px;
}
.tb-btn {
  border: none;
  border-radius: 5px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, opacity 0.12s;
}
.tb-btn.primary {
  background: #1a6cf0;
  color: #fff;
}
.tb-btn.primary:hover {
  background: #1558c9;
}
.tb-btn.danger {
  background: #fef0f0;
  color: #f56c6c;
}
.tb-btn.danger:hover {
  background: #fde2e2;
}

/* 视图控制 */
.graph-controls {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 4;
}
.ctl-btn {
  width: 30px;
  height: 30px;
  border: 1px solid #e0e8f5;
  background: #fff;
  color: #5a6a7c;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  box-shadow: 0 2px 6px rgba(13, 31, 60, 0.08);
  transition: color 0.12s, border-color 0.12s;
}
.ctl-btn:hover {
  color: #1a6cf0;
  border-color: #1a6cf0;
}
</style>
