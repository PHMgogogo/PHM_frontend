// 仪表盘工具函数
import { TOTAL_COLS, TOTAL_ROWS } from './dashboard-types.js'

/**
 * 生成唯一ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

/**
 * 深拷贝对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item))
  }
  
  const cloned = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key])
    }
  }
  return cloned
}

/**
 * 防抖函数
 */
export function debounce(func, delay) {
  let timeoutId
  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func.apply(this, args), delay)
  }
}

/**
 * 节流函数
 */
export function throttle(func, delay) {
  let lastTime = 0
  return function (...args) {
    const now = Date.now()
    if (now - lastTime >= delay) {
      lastTime = now
      return func.apply(this, args)
    }
  }
}

/**
 * 检测两个矩形是否重叠
 */
export function isOverlapping(rect1, rect2) {
  return (
    rect1.x < rect2.x + rect2.w &&
    rect1.x + rect1.w > rect2.x &&
    rect1.y < rect2.y + rect2.h &&
    rect1.y + rect1.h > rect2.y
  )
}

/**
 * 查找布局中的空位
 */
export function findEmptySpace(layout, w, h, cols, maxRows) {
  for (let y = 0; y <= maxRows - h; y++) {
    for (let x = 0; x <= cols - w; x++) {
      const newRect = { x, y, w, h }
      const hasConflict = layout.some(item => isOverlapping(newRect, item))
      if (!hasConflict) {
        return { x, y }
      }
    }
  }
  
  // 画布内已无空位：允许纵向溢出，堆叠到所有现有图表的最下方
  const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0)
  return { x: 0, y: maxY }
}

/**
 * 优化布局 - 三阶段双向扩展算法
 *
 * Phase 1 · 垂直紧凑  每个 item 尽可能上移，消除顶部空白
 * Phase 2 · 水平紧凑  每个 item 尽可能左移，消除左侧空白
 * Phase 3 · 双向扩展  先向右扩展填满水平间隙，再向下扩展填满垂直间隙
 */
export function optimizeLayout(layout, cols = TOTAL_COLS, rows = TOTAL_ROWS) {
  if (!layout || layout.length === 0) return layout

  const items = deepClone(layout)

  // ─── 辅助：X 轴是否重叠 ───
  const xOverlaps = (a, b) =>
    Math.max(a.x, b.x) < Math.min(a.x + a.w, b.x + b.w)

  // ─── 辅助：Y 轴是否重叠 ───
  const yOverlaps = (a, b) =>
    Math.max(a.y, b.y) < Math.min(a.y + a.h, b.y + b.h)

  // ─── Phase 1: 垂直紧凑（从上往下依次处理，已处理的作为障碍） ───
  items.sort((a, b) => a.y - b.y || a.x - b.x)

  for (let i = 0; i < items.length; i++) {
    const cur = items[i]
    let topEdge = 0
    for (let j = 0; j < i; j++) {
      const prev = items[j]
      if (xOverlaps(cur, prev)) {
        topEdge = Math.max(topEdge, prev.y + prev.h)
      }
    }
    cur.y = topEdge
  }

  // ─── Phase 2: 水平紧凑（从左往右依次处理，已处理的作为障碍） ───
  items.sort((a, b) => a.x - b.x || a.y - b.y)

  for (let i = 0; i < items.length; i++) {
    const cur = items[i]
    let leftEdge = 0
    for (let j = 0; j < i; j++) {
      const prev = items[j]
      if (yOverlaps(cur, prev)) {
        leftEdge = Math.max(leftEdge, prev.x + prev.w)
      }
    }
    // 防止超出右边界
    cur.x = Math.min(leftEdge, cols - cur.w)
  }

  // ─── Phase 3a: 向右扩展（不缩小，只填充右侧间隙） ───
  items.forEach(item => {
    let rightLimit = cols
    items.forEach(other => {
      if (item.i === other.i) return
      if (yOverlaps(item, other) && other.x >= item.x + item.w) {
        rightLimit = Math.min(rightLimit, other.x)
      }
    })
    if (rightLimit > item.x + item.w) {
      item.w = rightLimit - item.x
    }
  })

  // ─── Phase 3b: 向下扩展（不缩小，只填充下方间隙） ───
  items.forEach(item => {
    let bottomLimit = rows
    items.forEach(other => {
      if (item.i === other.i) return
      if (xOverlaps(item, other) && other.y >= item.y + item.h) {
        bottomLimit = Math.min(bottomLimit, other.y)
      }
    })
    if (bottomLimit > item.y + item.h) {
      item.h = bottomLimit - item.y
    }
  })

  return items
}

/**
 * 计算合适的行高
 */
export function calculateRowHeight(container, totalRows, margin = [10, 10], padding = [20, 20]) {
  if (!container) return 30
  
  const containerHeight = container.clientHeight
  const [marginY] = margin
  const [paddingY] = padding
  
  const availableHeight = containerHeight - paddingY * 2
  const totalGapHeight = (totalRows - 1) * marginY
  
  const rowHeight = (availableHeight - totalGapHeight) / totalRows
  
  return Math.max(rowHeight, 10)
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 本地存储工具
 */
export const storage = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch (error) {
      console.error('存储数据失败:', error)
      return false
    }
  },
  
  get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : defaultValue
    } catch (error) {
      console.error('读取数据失败:', error)
      return defaultValue
    }
  },
  
  remove(key) {
    try {
      localStorage.removeItem(key)
      return true
    } catch (error) {
      console.error('删除数据失败:', error)
      return false
    }
  },
  
  clear() {
    try {
      localStorage.clear()
      return true
    } catch (error) {
      console.error('清空数据失败:', error)
      return false
    }
  }
}

/**
 * 颜色工具
 */
export const colorUtils = {
  random() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
  },
  
  isDark(color) {
    const hex = color.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    return brightness < 128
  },
  
  getContrast(color) {
    return this.isDark(color) ? '#ffffff' : '#000000'
  },
  
  opacity(color, alpha) {
    if (color.startsWith('#')) {
      const hex = color.replace('#', '')
      const r = parseInt(hex.substr(0, 2), 16)
      const g = parseInt(hex.substr(2, 2), 16)
      const b = parseInt(hex.substr(4, 2), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    return color
  }
}

/**
 * 数据验证工具
 */
export const validator = {
  isNumber(value) {
    return typeof value === 'number' && !isNaN(value) && isFinite(value)
  },
  
  isPositiveNumber(value) {
    return this.isNumber(value) && value > 0
  },
  
  isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0
  },
  
  isColor(value) {
    if (typeof value !== 'string') return false
    if (/^#[0-9A-Fa-f]{6}$/i.test(value)) return true
    if (/^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(\s*,\s*[\d.]+)?\s*\)$/i.test(value)) return true
    const namedColors = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'gray']
    return namedColors.includes(value.toLowerCase())
  }
}
