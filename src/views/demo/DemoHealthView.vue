<template>
  <div class="demo-health">
    <h2 class="page-title">健康评估</h2>

    <el-tabs v-model="activeTab" type="border-card" class="health-tabs">
      <!-- Tab 1: 健康状态感知 -->
      <el-tab-pane label="健康状态感知" name="health">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-card style="height: calc(100vh - 280px); overflow-y: auto">
              <template #header>
                <span class="section-title"><el-icon><Cpu /></el-icon> 飞机/架次选择</span>
              </template>
              <div style="margin-bottom: 12px">
                <PlaneSelector />
              </div>
              <div style="margin-top: 12px; font-size: 12px; color: #8c9ab0; margin-bottom: 6px">选择架次：</div>
              <el-empty
                v-if="currentSorties.length === 0"
                description="无架次数据"
                :image-size="50"
              />
              <div
                v-for="sid in currentSorties"
                :key="sid"
                class="sortie-btn"
                :class="{ active: selectedSortie === sid }"
                @click="selectedSortie = sid"
              >
                {{ sid }}
              </div>
            </el-card>
          </el-col>

          <!-- 中：健康评估树 -->
          <el-col :span="9">
            <el-card style="height: calc(100vh - 280px); overflow-y: auto">
              <template #header>
                <span class="section-title"><el-icon><Share /></el-icon> 评估详情（树形结构）</span>
              </template>
              <el-empty v-if="!currentAssessment" description="请选择架次" :image-size="60" />
              <div v-else>
                <HealthTreeNode :node="currentAssessment" @select="onSelectNode" />
              </div>
            </el-card>
          </el-col>

          <!-- 右：参数时序 -->
          <el-col :span="9">
            <el-card style="height: calc(100vh - 280px); overflow-y: auto">
              <template #header>
                <span class="section-title"><el-icon><DataLine /></el-icon> 相关参数趋势</span>
              </template>
              <el-empty v-if="!selectedNode" description="请点击左侧树节点查看参数" :image-size="60" />
              <template v-else>
                <div style="margin-bottom: 10px">
                  <el-tag :type="statusTag(selectedNode.status)" effect="dark" size="default">
                    {{ selectedNode.label }} — 健康得分：{{ selectedNode.score }}
                  </el-tag>
                </div>
                <TimeSeriesChart
                  :series-data="nodeParamSeries"
                  :limits="{}"
                  x-label="架次"
                  height="260px"
                />
              </template>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <!-- Tab 2: 隐身健康状态评估 -->
      <el-tab-pane label="隐身健康状态评估" name="stealth">
        <StealthHealth />
      </el-tab-pane>

      <!-- Tab 3: 放飞支持 -->
      <el-tab-pane label="放飞支持" name="release">
        <ReleaseSupport />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDemoAppStore } from '@/stores/demoAppStore'
import PlaneSelector from '@/components/demo/PlaneSelector.vue'
import TimeSeriesChart from '@/components/demo/TimeSeriesChart.vue'
import HealthTreeNode from '@/components/demo/HealthTreeNode.vue'
import StealthHealth from '@/components/demo/StealthHealth.vue'
import ReleaseSupport from '@/components/demo/ReleaseSupport.vue'
import { healthTreeData } from '@/mock/demo/health'

const store = useDemoAppStore()
const activeTab = ref('health')
const selectedSortie = ref<string | null>(null)
const selectedNode = ref<any>(null)

const currentPlaneData = computed(() => (healthTreeData as any)[store.selectedPlaneId] || null)
const currentSorties = computed(() => currentPlaneData.value?.sorties || [])
const currentAssessment = computed(() => {
  if (!selectedSortie.value || !currentPlaneData.value) return null
  return currentPlaneData.value.assessments[selectedSortie.value] || null
})

// 动态生成节点健康得分趋势
const nodeParamSeries = computed(() => {
  if (!selectedNode.value) return {}
  const base = selectedNode.value.score
  return {
    [`${selectedNode.value.label}健康得分`]: Array.from({ length: 20 }, (_, i) => ({
      t: i + 1,
      v: +(base - (19 - i) * 0.2 + (Math.random() - 0.5) * 3).toFixed(1),
    })),
  }
})

function onSelectNode(node: any) { selectedNode.value = node }
function statusTag(s: string) {
  return s === 'normal' ? 'success' : s === 'warning' ? 'warning' : 'danger'
}
</script>

<style scoped>
.demo-health {
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

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
