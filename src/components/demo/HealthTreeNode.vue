<template>
  <div class="tree-node">
    <div
      class="node-row"
      :class="node.status"
      @click="$emit('select', node)"
    >
      <div style="display: flex; align-items: center; gap: 6px">
        <el-icon v-if="node.children?.length" @click.stop="expanded = !expanded" style="cursor: pointer; color: #3b7cff">
          <component :is="expanded ? ArrowDown : ArrowRight" />
        </el-icon>
        <el-icon v-else style="width: 16px" />
        <span class="node-label">{{ node.label }}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px">
        <el-progress
          :percentage="node.score"
          :color="scoreColor(node.score)"
          :stroke-width="6"
          style="width: 80px"
          :show-text="false"
        />
        <span class="node-score" :style="{ color: scoreColor(node.score) }">{{ node.score }}</span>
        <el-tag :type="statusTag(node.status)" size="small" effect="dark">
          {{ statusLabel(node.status) }}
        </el-tag>
      </div>
    </div>
    <div v-if="expanded && node.children?.length" class="children">
      <HealthTreeNode
        v-for="child in node.children"
        :key="child.label"
        :node="child"
        @select="$emit('select', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown, ArrowRight } from '@element-plus/icons-vue'

defineProps({ node: Object })
defineEmits(['select'])

const expanded = ref(true)

function scoreColor(score: number) {
  if (score >= 80) return '#52c41a'
  if (score >= 60) return '#faad14'
  return '#ff4d4f'
}
function statusTag(s: string) {
  return s === 'normal' ? 'success' : s === 'warning' ? 'warning' : 'danger'
}
function statusLabel(s: string) {
  return s === 'normal' ? '正常' : s === 'warning' ? '告警' : '故障'
}
</script>

<style scoped>
.tree-node { width: 100%; }

.node-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 4px;
  margin-bottom: 2px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.2s;
}
.node-row:hover { background: rgba(59, 124, 255, 0.06); }
.node-row.warning { border-left-color: #faad14; }
.node-row.fault { border-left-color: #ff4d4f; }
.node-row.normal { border-left-color: #52c41a; }

.node-label { font-size: 13px; color: #333; }
.node-score { font-family: monospace; font-size: 14px; font-weight: 700; min-width: 28px; text-align: right; }

.children {
  padding-left: 20px;
  border-left: 1px dashed #dde3ef;
  margin-left: 10px;
}
</style>
