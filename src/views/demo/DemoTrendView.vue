<template>
  <div class="demo-trend">
    <h2 class="page-title">趋势分析</h2>

    <el-tabs v-model="activeTab" type="border-card">
      <!-- Tab 1: 预防性维修到检信息 -->
      <el-tab-pane label="预防性维修到检信息" name="pm">
        <el-row :gutter="16">
          <el-col :span="9">
            <el-card style="height: calc(100vh - 290px); overflow-y: auto">
              <template #header>
                <div class="section-header">
                  <span class="section-title"><el-icon><List /></el-icon> 检查项列表</span>
                </div>
              </template>
              <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap">
                <PlaneSelector />
                <el-select v-model="pmSpecialty" size="small" style="width: 110px" placeholder="专业">
                  <el-option value="" label="全部专业" />
                  <el-option value="机械专业" label="机械专业" />
                  <el-option value="军械专业" label="军械专业" />
                  <el-option value="航电专业" label="航电专业" />
                </el-select>
              </div>
              <el-empty v-if="filteredPM.length === 0" description="暂无维修到检信息" :image-size="60" />
              <div
                v-for="item in filteredPM"
                :key="item.id"
                class="pm-item"
                :class="{ active: selectedPM?.id === item.id, [item.status]: true }"
                @click="selectedPM = item"
              >
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <span class="pm-name">{{ item.name }}</span>
                  <el-tag :type="pmStatusType(item.status)" size="small" effect="dark">
                    {{ pmStatusLabel(item.status) }}
                  </el-tag>
                </div>
                <div class="pm-meta">
                  <span>{{ item.specialty }}</span>
                  <span>{{ item.checkType }}</span>
                  <span>到检：{{ item.dueDate }}</span>
                </div>
                <el-progress
                  :percentage="Math.min(item.accumulatedHours / item.checkInterval * 100, 100)"
                  :color="pmProgressColor(item.status)"
                  :stroke-width="4"
                  :show-text="false"
                  style="margin-top: 6px"
                />
                <div class="pm-progress-text">{{ item.accumulatedHours }}/{{ item.checkInterval }}</div>
              </div>
            </el-card>
          </el-col>

          <!-- 右：趋势图 -->
          <el-col :span="15">
            <el-card style="height: calc(100vh - 290px); overflow-y: auto">
              <template #header>
                <span class="section-title"><el-icon><TrendCharts /></el-icon> 检查状态趋势</span>
              </template>
              <el-empty v-if="!selectedPM" description="请选择检查项查看趋势" :image-size="70" />
              <template v-else>
                <el-descriptions :column="3" border size="small" style="margin-bottom: 16px">
                  <el-descriptions-item label="检查项">{{ selectedPM.name }}</el-descriptions-item>
                  <el-descriptions-item label="类型">{{ selectedPM.checkType }}</el-descriptions-item>
                  <el-descriptions-item label="上次检查">{{ selectedPM.lastDate }}</el-descriptions-item>
                  <el-descriptions-item label="到检日期">{{ selectedPM.dueDate }}</el-descriptions-item>
                  <el-descriptions-item label="累计时间">{{ selectedPM.accumulatedHours }}/{{ selectedPM.checkInterval }}</el-descriptions-item>
                  <el-descriptions-item label="状态">
                    <el-tag :type="pmStatusType(selectedPM.status)" size="small">{{ pmStatusLabel(selectedPM.status) }}</el-tag>
                  </el-descriptions-item>
                </el-descriptions>
                <div style="font-size: 12px; color: #8c9ab0; margin-bottom: 6px">检查通过情况趋势（1=通过，0=不通过）：</div>
                <TimeSeriesChart
                  :series-data="{ '通过情况': selectedPM.trendData.map((d: any) => ({ t: d.time, v: d.pass })) }"
                  :limits="{ '通过情况': 0.5 }"
                  x-label="时间片"
                  height="260px"
                />
              </template>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- Tab 2: 整机/系统趋势分析 -->
      <el-tab-pane label="整机/系统趋势分析" name="sys" lazy>
        <el-card class="inference-card">
          <InstanceInferencePanel :instance-id="currentInstanceId" />
        </el-card>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDemoAppStore } from '@/stores/demoAppStore'
import { useTaskStore } from '@/stores/task'
import PlaneSelector from '@/components/demo/PlaneSelector.vue'
import TimeSeriesChart from '@/components/demo/TimeSeriesChart.vue'
import InstanceInferencePanel from '@/components/inference/InstanceInferencePanel.vue'
import { preventiveMaintenanceData } from '@/mock/demo/trend'

const store = useDemoAppStore()
const taskStore = useTaskStore()
const activeTab = ref('pm')
const pmSpecialty = ref('')
const selectedPM = ref<any>(null)

const allPM = computed(() => (preventiveMaintenanceData as any)[store.selectedPlaneId] || [])
const filteredPM = computed(() => {
  if (!pmSpecialty.value) return allPM.value
  return allPM.value.filter((p: any) => p.specialty === pmSpecialty.value)
})
const currentInstanceId = computed(
  () => taskStore.currentTask?.instanceId || taskStore.tasks.find((task) => task.instanceId)?.instanceId || '',
)

function pmStatusType(s: string) {
  return s === 'normal' ? 'success' : s === 'warning' ? 'warning' : 'danger'
}
function pmStatusLabel(s: string) {
  return s === 'normal' ? '正常' : s === 'warning' ? '即将到检' : '已超时'
}
function pmProgressColor(s: string) {
  return s === 'normal' ? '#52c41a' : s === 'warning' ? '#faad14' : '#ff4d4f'
}

watch(() => store.selectedPlaneId, () => {
  selectedPM.value = null
})
</script>

<style scoped>
.demo-trend {
  padding: 0 32px 32px;
  overflow-y: auto;
  height: 100%;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: #0d1f3c;
  margin: 24px 0 16px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.pm-item, .trend-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 8px;
  border: 1px solid #e4e8f1;
  border-left: 3px solid #e4e8f1;
  transition: all 0.2s;
}
.pm-item:hover, .pm-item.active,
.trend-item:hover, .trend-item.active {
  background: rgba(59, 124, 255, 0.05);
  border-color: #3b7cff;
  border-left-color: #3b7cff;
}
.pm-item.warning { border-left-color: #faad14; }
.pm-item.overdue { border-left-color: #ff4d4f; }

.pm-name, .trend-name {
  font-size: 13px;
  font-weight: 600;
  color: #0d1f3c;
  margin-bottom: 4px;
}
.pm-meta, .trend-meta {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: #8c9ab0;
  margin-bottom: 2px;
}
.pm-progress-text {
  font-size: 11px;
  color: #8c9ab0;
  text-align: right;
  margin-top: 2px;
}

.inference-card {
  max-height: calc(100vh - 290px);
  overflow-y: auto;
}
</style>
