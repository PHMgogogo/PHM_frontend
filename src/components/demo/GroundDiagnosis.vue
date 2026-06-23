<template>
  <div class="gd">
    <el-row :gutter="16">
      <!-- 左侧：筛选+故障列表 -->
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><Search /></el-icon> 故障结果筛选</span>
            </div>
          </template>
          <div style="margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
            <PlaneSelector />
          </div>
          <el-empty v-if="currentFaults.length === 0" description="该飞机暂无综合诊断故障记录" :image-size="60" />
          <div
            v-for="f in currentFaults"
            :key="f.id"
            class="fault-item"
            :class="{ active: selectedFault?.id === f.id }"
            @click="selectFault(f)"
          >
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span class="fault-name">{{ f.faultName }}</span>
              <el-tag type="danger" size="small">{{ f.faultCode }}</el-tag>
            </div>
            <div class="fault-meta">
              <span>{{ f.date }}</span>
              <span>{{ f.sortieId }}</span>
              <span>{{ f.system }}</span>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧：故障相关参数与时序图 -->
      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="section-header">
              <span class="section-title"><el-icon><DataLine /></el-icon> 故障相关参数分析</span>
              <div v-if="selectedFault" style="display: flex; gap: 8px; align-items: center">
                <span style="font-size: 12px; color: #8c9ab0">采样率：</span>
                <el-select v-model="sampleRate" size="small" style="width: 80px">
                  <el-option :value="1" label="1Hz" />
                  <el-option :value="5" label="5Hz" />
                  <el-option :value="10" label="10Hz" />
                </el-select>
              </div>
            </div>
          </template>
          <el-empty v-if="!selectedFault" description="请从左侧选择故障条目" :image-size="70" />
          <template v-else>
            <div style="margin-bottom: 12px">
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="故障名称">{{ selectedFault.faultName }}</el-descriptions-item>
                <el-descriptions-item label="故障码">{{ selectedFault.faultCode }}</el-descriptions-item>
                <el-descriptions-item label="所属系统">{{ selectedFault.system }}</el-descriptions-item>
                <el-descriptions-item label="飞行日期">{{ selectedFault.date }}</el-descriptions-item>
              </el-descriptions>
            </div>
            <!-- 参数勾选 -->
            <div style="margin-bottom: 8px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
              <span style="font-size: 12px; color: #8c9ab0">相关参数：</span>
              <el-checkbox-group v-model="checkedParams" size="small">
                <el-checkbox v-for="p in selectedFault.params" :key="p" :label="p" :value="p">
                  {{ p }}
                </el-checkbox>
              </el-checkbox-group>
            </div>
            <TimeSeriesChart
              :series-data="paramSeries"
              :limits="{}"
              x-label="时间(s)"
              height="300px"
            />
          </template>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDemoAppStore } from '@/stores/demoAppStore'
import PlaneSelector from '@/components/demo/PlaneSelector.vue'
import TimeSeriesChart from '@/components/demo/TimeSeriesChart.vue'
import { groundDiagFaults } from '@/mock/demo/diagnosis'

const store = useDemoAppStore()
const selectedFault = ref<any>(null)
const checkedParams = ref<string[]>([])
const sampleRate = ref(1)

const currentFaults = computed(() => (groundDiagFaults as any)[store.selectedPlaneId] || [])

// 生成随机时序数据（地面综合诊断参数，没有预设，动态生成）
function genSeries(paramName: string) {
  const bases: Record<string, number> = { 'MPa': 19.5, '℃': 90, '(%)': 85, '(V)': 2.5, '(L)': 180 }
  const unit = Object.keys(bases).find(k => paramName.includes(k))
  const base = unit ? bases[unit] : 50
  return Array.from({ length: 60 }, (_, i) => ({
    t: i, v: +(base + (Math.random() - 0.5) * base * 0.15).toFixed(2),
  }))
}

const paramSeries = computed(() => {
  if (!selectedFault.value || checkedParams.value.length === 0) return {}
  return Object.fromEntries(checkedParams.value.map(p => [p, genSeries(p)]))
})

function selectFault(f: any) {
  selectedFault.value = f
  checkedParams.value = f.params.slice(0, 2)
}

watch(() => store.selectedPlaneId, () => {
  selectedFault.value = null
  checkedParams.value = []
})
</script>

<style scoped>
.fault-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid #e4e8f1;
  transition: all 0.2s;
}

.fault-item:hover, .fault-item.active {
  background: rgba(59, 124, 255, 0.06);
  border-color: #3b7cff;
}

.fault-name {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
}

.fault-meta {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #8c9ab0;
  margin-top: 4px;
}
</style>
