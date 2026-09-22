<!--
  属性选择器（时序数据查询用）。

  三方平台的参数组可下发上万条属性名（实测航新 10000+），用下拉展示有两个绕不开的问题：
  用户没法在一万条里「浏览」只能靠前缀猜；选中项与候选挤在同一个浮层里，核对已选很别扭。
  故改成「筛选栏一个按钮 + 右侧抽屉」：

  - 抽屉里是 搜索框 + 列表 + 已选区，列表只渲染可视区（固定行高虚拟滚动），万级候选不卡；
  - 命中数与总数同屏，用户知道自己的筛选落在多大范围里；
  - 回车可直接添加输入的名字：后端只给「参数组里的列名」，不保证覆盖平台全部可查字段；
  - 「批量粘贴」一次录入一批：这些参数名通常是从平台文档里复制出来的。
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Search } from '@element-plus/icons-vue'
import { filterProperties, normalizeProperties, parsePropertyInput } from '@/utils/timeseries'

const props = defineProps<{
  /** 已选属性（v-model） */
  modelValue: string[]
  /** 候选属性名，可上万条 */
  options?: string[] | null
  /** 候选加载中 */
  loading?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string[]): void
}>()

const visible = ref(false)
const keyword = ref('')
const pasteOpen = ref(false)
const pasteText = ref('')

const selected = computed<string[]>(() => props.modelValue ?? [])
const selectedSet = computed(() => new Set(selected.value))

/** 候选归一：只依赖 props.options，不随输入变化重算（万级数组每次按键都重算不划算） */
const all = computed(() => normalizeProperties(props.options))
/** 搜索命中 */
const matched = computed(() => filterProperties(all.value, keyword.value))

// ---- 虚拟滚动：固定行高，只渲染可视区那几十行 ----
const ROW_HEIGHT = 34
/** 上下各多渲染几行，滚动时不留白 */
const OVERSCAN = 6
const listEl = ref<HTMLElement>()
const scrollTop = ref(0)
const listHeight = ref(360)

/** 列表高度跟着窗口走，避免依赖 DOM 测量 */
function measure() {
  listHeight.value = Math.max(240, Math.min(560, window.innerHeight - 360))
}

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - OVERSCAN))
const endIndex = computed(() =>
  Math.min(matched.value.length, startIndex.value + Math.ceil(listHeight.value / ROW_HEIGHT) + OVERSCAN * 2),
)
/** 当前要渲染的行（自带绝对定位偏移，配合撑高的占位层实现滚动） */
const visibleRows = computed(() =>
  matched.value.slice(startIndex.value, endIndex.value).map((word, i) => ({
    word,
    top: (startIndex.value + i) * ROW_HEIGHT,
  })),
)

function onScroll() {
  scrollTop.value = listEl.value?.scrollTop ?? 0
}

// 换关键字后回到顶部，否则会在新结果的中间位置「凭空开始」
watch(keyword, () => {
  scrollTop.value = 0
  if (listEl.value) listEl.value.scrollTop = 0
})

watch(visible, (open) => {
  if (!open) return
  keyword.value = ''
  pasteOpen.value = false
  pasteText.value = ''
  scrollTop.value = 0
  if (listEl.value) listEl.value.scrollTop = 0
})

onMounted(() => {
  measure()
  window.addEventListener('resize', measure)
})
onUnmounted(() => window.removeEventListener('resize', measure))

// ---- 增删 ----
function add(names: string[]) {
  const merged = normalizeProperties([...selected.value, ...names])
  if (merged.length !== selected.value.length) emit('update:modelValue', merged)
}

function remove(name: string) {
  emit(
    'update:modelValue',
    selected.value.filter((n) => n !== name),
  )
}

function toggle(name: string) {
  if (selectedSet.value.has(name)) remove(name)
  else add([name])
}

function clearAll() {
  if (selected.value.length) emit('update:modelValue', [])
}

/** 回车：把输入框里的名字直接加进去（不要求它先在候选里） */
function addKeyword() {
  const name = keyword.value.trim()
  if (!name) return
  add([name])
  keyword.value = ''
}

function addPasted() {
  const names = parsePropertyInput(pasteText.value)
  if (!names.length) return
  add(names)
  pasteText.value = ''
  pasteOpen.value = false
}
</script>

<template>
  <div class="prop-picker">
    <el-button class="picker-btn" :disabled="disabled" @click="visible = true">
      <el-icon style="margin-right: 4px"><Search /></el-icon>
      选择属性
      <span class="picker-count">{{ selected.length ? `已选 ${selected.length}` : '未选' }}</span>
    </el-button>

    <el-drawer
      v-model="visible"
      title="选择属性"
      direction="rtl"
      :size="520"
      append-to-body
      class="prop-drawer"
    >
      <div class="drawer-body">
        <el-input
          v-model="keyword"
          clearable
          placeholder="搜索属性名，回车可直接添加"
          class="prop-search"
          @keyup.enter="addKeyword"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <div class="prop-count">
          <template v-if="keyword.trim()">
            命中 {{ matched.length }} 个 / 共 {{ all.length }} 个
          </template>
          <template v-else>共 {{ all.length }} 个属性</template>
        </div>

        <div ref="listEl" class="prop-list" :style="{ height: `${listHeight}px` }" @scroll="onScroll">
          <div class="prop-phantom" :style="{ height: `${matched.length * ROW_HEIGHT}px` }">
            <div
              v-for="row in visibleRows"
              :key="row.word"
              class="prop-row"
              :class="{ checked: selectedSet.has(row.word) }"
              :style="{ transform: `translateY(${row.top}px)` }"
              @click="toggle(row.word)"
            >
              <el-checkbox :model-value="selectedSet.has(row.word)" @click.stop="toggle(row.word)" />
              <span class="prop-name">{{ row.word }}</span>
            </div>
          </div>

          <div v-if="loading" class="prop-empty">正在加载属性...</div>
          <div v-else-if="!matched.length" class="prop-empty">
            <template v-if="all.length">
              没有匹配「{{ keyword.trim() }}」的属性，回车可把它作为属性名添加
            </template>
            <template v-else>该架次没有属性候选，可输入属性名后回车添加</template>
          </div>
        </div>

        <div class="prop-selected">
          <div class="prop-selected-head">
            <span>已选 {{ selected.length }} 个</span>
            <el-button v-if="selected.length" link type="primary" size="small" @click="clearAll">
              清空
            </el-button>
          </div>
          <div v-if="selected.length" class="prop-selected-tags">
            <el-tag
              v-for="name in selected"
              :key="name"
              size="small"
              closable
              @close="remove(name)"
            >
              {{ name }}
            </el-tag>
          </div>
          <div v-else class="prop-selected-empty">未选择时按平台默认列名返回数据</div>
        </div>

        <div class="prop-paste">
          <el-button link type="primary" size="small" @click="pasteOpen = !pasteOpen">
            {{ pasteOpen ? '收起批量粘贴' : '批量粘贴' }}
          </el-button>
          <div v-if="pasteOpen" class="prop-paste-body">
            <el-input
              v-model="pasteText"
              type="textarea"
              :rows="3"
              placeholder="每行一个属性名，也可用逗号 / 分号分隔"
            />
            <el-button type="primary" size="small" :disabled="!pasteText.trim()" @click="addPasted">
              添加
            </el-button>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button type="primary" @click="visible = false">完成</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.picker-btn {
  min-width: 148px;
  justify-content: flex-start;
}

.picker-count {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid var(--el-border-color);
  font-size: 12px;
  color: #909399;
}

.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
}

.prop-count {
  font-size: 12px;
  color: #909399;
  margin-top: -4px;
}

/* 列表本体是滚动容器，行用 transform 定位；占位层撑出总高度 */
.prop-list {
  position: relative;
  overflow-y: auto;
  border: 1px solid #e4e9f2;
  border-radius: 8px;
  background: #fff;
}

.prop-phantom {
  position: relative;
}

.prop-row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  cursor: pointer;
  border-bottom: 1px solid #f4f7fb;
}

.prop-row:hover {
  background: #f7faff;
}

.prop-row.checked {
  background: #f0f6ff;
}

.prop-name {
  font-size: 13px;
  color: #0d1f3c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prop-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: #909399;
}

.prop-selected {
  border-top: 1px solid #eef2f8;
  padding-top: 10px;
}

.prop-selected-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: #3a4a5c;
}

.prop-selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
  max-height: 96px;
  overflow-y: auto;
}

.prop-selected-empty {
  margin-top: 6px;
  font-size: 12px;
  color: #a7b0bd;
}

.prop-paste-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
  align-items: flex-end;
}
</style>
