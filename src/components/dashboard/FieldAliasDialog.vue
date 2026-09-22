<!-- 字段中文别名批量配置对话框：列出当前数据列，统一填写中文别名。
     草稿式编辑：打开时从 store 拷贝，确定才提交；取消/X/遮罩丢弃草稿。
     store 是唯一数据源，组件只做编辑器，不 emit 结果回传。 -->
<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useFieldAliasStore } from '@/stores/fieldAlias'

const props = defineProps<{
  visible: boolean
  /** 当前列候选（原始英文字段名），父级传 DataSourcePanel 的 columns */
  columns: string[]
}>()

const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
}>()

const aliasStore = useFieldAliasStore()

// 本地草稿：打开对话框时按 columns 从 store 拷贝；编辑只改草稿，确定时整体提交
const draft = ref<Record<string, string>>({})

watch(
  () => props.visible,
  (v) => {
    if (!v) return
    const next: Record<string, string> = {}
    props.columns.forEach((c) => {
      next[c] = aliasStore.aliases[c] ?? ''
    })
    draft.value = next
  },
)

function handleConfirm() {
  aliasStore.setAliases(draft.value)
  ElMessage.success('字段别名已更新')
  emit('update:visible', false)
}

function handleClose() {
  // 取消/右上角 X/遮罩点击：丢弃草稿，不改 store
  emit('update:visible', false)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="批量配置字段别名"
    width="560px"
    :close-on-click-modal="false"
    @update:model-value="handleClose"
  >
    <p class="alias-dialog-hint">
      清空输入即恢复英文原名；别名仅本次会话有效，刷新页面后失效。
    </p>

    <el-table :data="props.columns.map((c) => ({ field: c }))" max-height="420" size="small">
      <el-table-column label="字段名" prop="field" min-width="160" show-overflow-tooltip>
        <template #default="{ row }">
          <span class="alias-dialog-field">{{ row.field }}</span>
        </template>
      </el-table-column>
      <el-table-column label="中文别名" min-width="220">
        <template #default="{ row }">
          <el-input
            v-model="draft[row.field]"
            placeholder="留空显示英文原名"
            clearable
          />
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleConfirm">确定</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.alias-dialog-hint {
  margin: 0 0 12px;
  font-size: 12px;
  color: #8c9ab0;
}

.alias-dialog-field {
  color: #8c9ab0;
  font-size: 12px;
}
</style>
