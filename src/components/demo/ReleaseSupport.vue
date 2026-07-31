<template>
  <div>
    <el-row :gutter="16">
      <!-- 机队汇总 -->
      <el-col :span="24" style="margin-bottom: 16px">
        <el-card>
          <template #header>
            <span class="section-title"><el-icon><Flag /></el-icon> 机队放飞汇总</span>
          </template>
          <el-row :gutter="12">
            <el-col :span="8" v-for="sq in squadronReleaseData" :key="sq.squadronId">
              <div class="squad-card" :class="sq.canRelease ? 'ok' : 'no'">
                <div class="squad-name">{{ sq.squadronName }}</div>
                <el-tag :type="sq.canRelease ? 'success' : 'danger'" effect="dark" size="large" style="margin: 8px 0">
                  <el-icon><CircleCheck v-if="sq.canRelease" /><CircleClose v-else /></el-icon> {{ sq.canRelease ? '建议放飞' : '不建议放飞' }}
                </el-tag>
                <div class="squad-reason">{{ sq.reason }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <!-- 单机列表 -->
      <el-col :span="24">
        <el-card>
          <template #header>
            <span class="section-title"><el-icon><Avatar /></el-icon> 单机放飞状态</span>
          </template>
          <el-table :data="releaseFlightData" size="small">
            <el-table-column prop="planeNo" label="机号" width="140" />
            <el-table-column prop="squadron" label="所属机队" width="140" />
            <el-table-column label="放飞建议" width="120">
              <template #default="{ row }">
                <el-tag :type="row.canRelease ? 'success' : 'danger'" effect="dark">
                  {{ row.canRelease ? '可放飞' : '不可放飞' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="reason" label="说明" />
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { releaseFlightData, squadronReleaseData } from '@/mock/demo/health'
import { Flag, Avatar, CircleCheck, CircleClose } from '@element-plus/icons-vue'
</script>

<style scoped>
.squad-card {
  padding: 16px;
  border-radius: 8px;
  text-align: center;
  border: 2px solid transparent;
}
.squad-card.ok {
  background: rgba(82, 196, 26, 0.06);
  border-color: rgba(82, 196, 26, 0.25);
}
.squad-card.no {
  background: rgba(255, 77, 79, 0.06);
  border-color: rgba(255, 77, 79, 0.25);
}
.squad-name {
  font-size: 14px;
  font-weight: 600;
  color: #0d1f3c;
}
.squad-reason {
  font-size: 12px;
  color: #8c9ab0;
  margin-top: 6px;
  line-height: 1.4;
}
</style>
