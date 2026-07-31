<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="7">
        <el-card style="height: calc(100vh - 310px)">
          <template #header>
            <span class="section-title"><el-icon><Cpu /></el-icon> 飞机选择</span>
          </template>
          <PlaneSelector />
          <div style="margin-top: 12px; font-size: 12px; color: #8c9ab0; margin-bottom: 6px">选择架次：</div>
          <div
            v-for="sid in currentSorties"
            :key="sid"
            class="sortie-btn"
            :class="{ active: selectedSortie === sid }"
            @click="selectedSortie = sid"
          >{{ sid }}</div>
        </el-card>
      </el-col>
      <el-col :span="17">
        <el-card style="height: calc(100vh - 310px); overflow-y: auto">
          <template #header>
            <span class="section-title"><el-icon><Shield /></el-icon> 隐身健康状态评估</span>
          </template>
          <el-empty v-if="!currentData" description="请选择架次" :image-size="70" />
          <template v-else>
            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 16px">
              <el-tag :type="overallTag" effect="dark" size="large">
                综合评分：{{ currentData.overallScore }}
              </el-tag>
              <el-progress
                :percentage="currentData.overallScore"
                :color="scoreColor(currentData.overallScore)"
                style="width: 200px"
              />
            </div>
            <el-table :data="currentData.items" size="small">
              <el-table-column prop="area" label="评估区域" width="160" />
              <el-table-column label="状态" width="80">
                <template #default="{ row }">
                  <el-tag :type="statusTag(row.status)" size="small" effect="dark">
                    {{ statusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="得分" width="120">
                <template #default="{ row }">
                  <el-progress :percentage="row.score" :color="scoreColor(row.score)" :stroke-width="6" />
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" />
            </el-table>
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoAppStore } from '@/stores/demoAppStore'
import PlaneSelector from '@/components/demo/PlaneSelector.vue'
import { stealthHealthData } from '@/mock/demo/health'

const store = useDemoAppStore()
const selectedSortie = ref<string | null>(null)

const currentPlaneData = computed(() => (stealthHealthData as any)[store.selectedPlaneId] || null)
const currentSorties = computed(() => Object.keys(currentPlaneData.value || {}))
const currentData = computed(() => {
  if (!selectedSortie.value || !currentPlaneData.value) return null
  return currentPlaneData.value[selectedSortie.value] || null
})

const overallTag = computed(() => {
  const s = currentData.value?.status
  return s === 'normal' ? 'success' : s === 'warning' ? 'warning' : 'danger'
})

function scoreColor(score: number) {
  if (score >= 80) return '#52c41a'
  if (score >= 60) return '#faad14'
  return '#ff4d4f'
}
function statusTag(s: string) { return s === 'normal' ? 'success' : s === 'warning' ? 'warning' : 'danger' }
function statusLabel(s: string) { return s === 'normal' ? '正常' : s === 'warning' ? '告警' : '故障' }
</script>

<style scoped>
.sortie-btn {
  padding: 6px 10px;
  margin-bottom: 4px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  color: #8c9ab0;
  border: 1px solid #e4e8f1;
  transition: all 0.2s;
}
.sortie-btn:hover, .sortie-btn.active {
  background: rgba(59, 124, 255, 0.08);
  border-color: #3b7cff;
  color: #3b7cff;
}
</style>
