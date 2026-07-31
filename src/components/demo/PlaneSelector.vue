<template>
  <div class="plane-selector">
    <el-radio-group v-model="mode" size="small" @change="onModeChange" class="mode-radio">
      <el-radio-button value="plane">单机</el-radio-button>
      <el-radio-button value="squadron">机队</el-radio-button>
    </el-radio-group>

    <el-select
      v-if="mode === 'plane'"
      v-model="selectedId"
      placeholder="选择飞机"
      size="small"
      style="width: 200px"
      @change="onSelect"
    >
      <el-option
        v-for="p in planes"
        :key="p.id"
        :label="p.planeNo"
        :value="p.id"
      >
        <span>{{ p.planeNo }}</span>
        <el-tag
          :type="statusType(p.status)"
          size="small"
          style="margin-left: 8px; float: right; margin-top: 6px"
        >
          {{ statusLabel(p.status) }}
        </el-tag>
      </el-option>
    </el-select>

    <el-select
      v-else
      v-model="selectedId"
      placeholder="选择机队"
      size="small"
      style="width: 200px"
      @change="onSelect"
    >
      <el-option
        v-for="sq in squadrons"
        :key="sq.id"
        :label="sq.name"
        :value="sq.id"
      />
    </el-select>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDemoAppStore } from '@/stores/demoAppStore'

const store = useDemoAppStore()
const mode = ref(store.selectorMode)
const selectedId = ref<string | null>(mode.value === 'plane' ? store.selectedPlaneId : store.selectedSquadronId)

const planes = store.planes
const squadrons = store.squadrons

function statusType(s: string) {
  return s === 'normal' ? 'success' : s === 'warning' ? 'warning' : 'danger'
}
function statusLabel(s: string) {
  return s === 'normal' ? '正常' : s === 'warning' ? '告警' : '故障'
}

function onModeChange() {
  selectedId.value = mode.value === 'plane' ? planes[0]?.id : squadrons[0]?.id
  onSelect(selectedId.value)
}

function onSelect(val: string | null) {
  if (val) {
    if (mode.value === 'plane') store.selectPlane(val)
    else store.selectSquadron(val)
  }
}

watch(() => store.selectedPlaneId, v => {
  if (mode.value === 'plane') selectedId.value = v
})
</script>

<style scoped>
.plane-selector {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
