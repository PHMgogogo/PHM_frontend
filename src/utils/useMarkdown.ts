import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import { renderToString } from 'katex'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import json from 'highlight.js/lib/languages/json'
import bash from 'highlight.js/lib/languages/bash'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import diff from 'highlight.js/lib/languages/diff'

// 按需注册常见语言（覆盖 95% 场景，gzip 后约 30-40KB，远优于全量）
;([
  ['javascript', javascript],
  ['typescript', typescript],
  ['python', python],
  ['json', json],
  ['bash', bash],
  ['shell', shell],
  ['sql', sql],
  ['xml', xml],
  ['css', css],
  ['go', go],
  ['rust', rust],
  ['java', java],
  ['yaml', yaml],
  ['markdown', markdown],
  ['diff', diff],
] as const).forEach(([name, lang]) => hljs.registerLanguage(name, lang))

// 语言别名表（统一小写、常见缩写映射到已注册语言）
const HLJS_ALIAS: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  html: 'xml',
  yml: 'yaml',
  md: 'markdown',
  golang: 'go',
  rs: 'rust',
}

/**
 * 围栏代码块高亮 + 工具栏（语言标签 / 复制按钮）。
 * markdown-it 的 highlight 选项返回值会整体替换 <pre>...</pre>。
 */
function highlightCode(code: string, langRaw: string): string {
  const langKey = langRaw ? langRaw.toLowerCase() : ''
  const lang = HLJS_ALIAS[langKey] ?? langKey
  let highlighted: string
  let displayLang = langRaw || 'code'

  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      highlighted = md.utils.escapeHtml(code)
    }
  } else {
    // 未注册语言：尝试自动检测；失败则纯文本降级
    try {
      const auto = hljs.highlightAuto(code)
      highlighted = auto.value
      if (auto.language) displayLang = auto.language
    } catch {
      highlighted = md.utils.escapeHtml(code)
    }
  }

  const escapedLang = md.utils.escapeHtml(displayLang)
  return (
    `<pre class="code-block" data-lang="${escapedLang}">` +
      `<div class="code-header">` +
        `<span class="code-lang">${escapedLang}</span>` +
        `<button class="code-copy-btn" type="button" aria-label="复制代码">复制</button>` +
      `</div>` +
      `<code class="hljs">${highlighted}</code>` +
    `</pre>`
  )
}

const md = new MarkdownIt({
  // 模型会直接返回 <br>、<table> 等展示型 HTML；统一在 renderMarkdown 末尾净化。
  html: true,
  breaks: true,
  linkify: true,
  highlight: highlightCode,
})

const TABLE_DELIMITER_CELL = /^:?-+:?$/

function splitTableRow(line: string): string[] {
  let value = line.trim()
  if (value.startsWith('|')) value = value.slice(1)
  if (value.endsWith('|') && !value.endsWith('\\|')) value = value.slice(0, -1)

  const cells: string[] = []
  let current = ''
  let escaped = false

  for (const char of value) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === '\\') {
      current += char
      escaped = true
    } else if (char === '|') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function trimTrailingEmptyCells(cells: string[]): string[] {
  const result = [...cells]
  while (result.length > 0 && result[result.length - 1] === '') result.pop()
  return result
}

function isTableDelimiterRow(line: string): boolean {
  const cells = splitTableRow(line).filter(Boolean)
  return cells.length > 0 && cells.every((cell) => TABLE_DELIMITER_CELL.test(cell))
}

function formatTableRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

/**
 * 未闭合的 <table> 会让浏览器把后续 Markdown 全部塞进最后一个单元格。
 * 这类表格已无法可靠恢复行列关系，降级成文本流比展示一张吞掉正文的表格更安全。
 */
function demoteUnclosedHtmlTable(text: string): string {
  const openingIndex = text.search(/<table\b/i)
  if (openingIndex === -1) return text

  const openingCount = text.match(/<table\b/gi)?.length ?? 0
  const closingCount = text.match(/<\/table\s*>/gi)?.length ?? 0
  if (openingCount <= closingCount) return text

  const beforeTable = text.slice(0, openingIndex)
  const tableAndFollowingContent = text
    .slice(openingIndex)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*hr\s*\/?\s*>/gi, '\n\n---\n\n')
    .replace(/<\s*\/?\s*(?:tr|p|div|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<\s*\/?\s*(?:td|th)\b[^>]*>/gi, ' | ')
    .replace(/<\/?[a-z][^>]*>/gi, '')

  return beforeTable + tableAndFollowingContent
}

/**
 * mermaid 围栏未闭合时，后续标题和正文都会被当成代码。Mermaid 语法本身不使用
 * Markdown 标题，因此在空行后的首个标题前补一个结束围栏，尽量保住后续内容。
 */
function closeUnclosedMermaidFence(text: string): string {
  const lines = text.split('\n')
  let fence: { char: string; length: number; start: number; lang: string } | null = null

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*(`{3,}|~{3,})\s*([^\s`]*)/)

    if (!fence) {
      if (match) {
        fence = {
          char: match[1][0],
          length: match[1].length,
          start: i,
          lang: (match[2] || '').toLowerCase(),
        }
      }
      continue
    }

    if (match && match[1][0] === fence.char && match[1].length >= fence.length) {
      fence = null
      continue
    }

    if (fence.lang === 'mermaid' && /^\s*#{1,6}\s/.test(lines[i]) && lines[i - 1]?.trim() === '') {
      lines.splice(i, 0, fence.char.repeat(fence.length))
      fence = null
    }
  }

  if (fence) lines.push(fence.char.repeat(fence.length))
  return lines.join('\n')
}

/**
 * 模型生成的 Markdown 表格经常在行尾多出一个 `|`，导致 markdown-it 把整张表
 * 当作普通段落输出。这里只修复已经有合法分隔行的表格，普通文本不受影响。
 */
function repairMarkdownTables(text: string): string {
  const lines = text.split('\n')

  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !isTableDelimiterRow(lines[i + 1])) continue

    const headerCells = trimTrailingEmptyCells(splitTableRow(lines[i]))
    if (headerCells.length < 2) continue

    const delimiterCells = trimTrailingEmptyCells(splitTableRow(lines[i + 1]))
    const repairedDelimiterCells = headerCells.map((_, index) => {
      const cell = delimiterCells[index] ?? ''
      return TABLE_DELIMITER_CELL.test(cell) ? cell : '---'
    })

    lines[i] = formatTableRow(headerCells)
    lines[i + 1] = formatTableRow(repairedDelimiterCells)

    let rowIndex = i + 2
    while (rowIndex < lines.length && lines[rowIndex].includes('|')) {
      const rowCells = trimTrailingEmptyCells(splitTableRow(lines[rowIndex]))
      while (rowCells.length < headerCells.length) rowCells.push('')
      lines[rowIndex] = formatTableRow(rowCells)
      rowIndex++
    }
    i = rowIndex - 1
  }

  return lines.join('\n')
}

// ---- 渲染结果 LRU 缓存（历史消息 / 切换会话 / 滚动重渲染命中，避免重复解析）----
const RENDER_CACHE_MAX = 64
const RENDER_CACHE = new Map<string, string>()

function getCached(text: string): string | undefined {
  const v = RENDER_CACHE.get(text)
  if (v !== undefined) {
    // move-to-end，保证 LRU 顺序
    RENDER_CACHE.delete(text)
    RENDER_CACHE.set(text, v)
  }
  return v
}

function setCached(text: string, html: string) {
  if (RENDER_CACHE.size >= RENDER_CACHE_MAX) {
    const firstKey = RENDER_CACHE.keys().next().value
    if (firstKey !== undefined) RENDER_CACHE.delete(firstKey)
  }
  RENDER_CACHE.set(text, html)
}

function sanitizeRenderedHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true, svg: true },
    FORBID_TAGS: [
      'script',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'textarea',
      'select',
      'option',
      'meta',
      'link',
      'style',
    ],
    FORBID_ATTR: ['srcdoc', 'formaction'],
  })

  const template = document.createElement('template')
  template.innerHTML = clean
  for (const anchor of template.content.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')
    if (href) {
      try {
        const protocol = new URL(href, window.location.href).protocol
        if (!['http:', 'https:', 'mailto:'].includes(protocol)) anchor.removeAttribute('href')
      } catch {
        anchor.removeAttribute('href')
      }
    }
    if (anchor.hasAttribute('href')) anchor.setAttribute('target', '_blank')
    anchor.setAttribute('rel', 'noopener noreferrer')
  }
  return template.innerHTML
}

/**
 * 渲染 Markdown 文本为 HTML，支持：
 * - 标准 Markdown（标题、加粗、斜体、列表、表格、代码块、链接等）
 * - 代码语法高亮（highlight.js）+ 语言标签 + 复制按钮
 * - LaTeX 行内公式：$E=mc^2$
 * - LaTeX 块级公式：$$\int_0^1 x^2 dx$$
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''

  const cached = getCached(text)
  if (cached !== undefined) return cached

  const mathBlocks = new Map<string, { math: string; display: boolean }>()
  let processed = closeUnclosedMermaidFence(demoteUnclosedHtmlTable(text))
  processed = repairMarkdownTables(processed)

  // 1. 保护 $$...$$ 块级公式
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const id = `PHM_KATEX_${mathBlocks.size}`
    mathBlocks.set(id, { math: math.trim(), display: true })
    return `PHMKATEXTOKEN${id}END`
  })

  // 2. 保护 $...$ 行内公式（不匹配 $$）
  processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, math) => {
    const id = `PHM_KATEX_${mathBlocks.size}`
    mathBlocks.set(id, { math: math.trim(), display: false })
    return `PHMKATEXTOKEN${id}END`
  })

  // 3. 渲染 Markdown
  let html = md.render(processed)

  // 4. 还原公式为 KaTeX HTML
  html = html.replace(/PHMKATEXTOKEN([A-Z0-9_]+)END/g, (_, id: string) => {
    const info = mathBlocks.get(id)
    if (!info) return ''
    try {
      return renderToString(info.math, {
        displayMode: info.display,
        throwOnError: false,
        strict: false,
      })
    } catch {
      return info.display
        ? `<pre class="katex-error">${md.utils.escapeHtml(info.math)}</pre>`
        : md.utils.escapeHtml(info.math)
    }
  })

  const sanitized = sanitizeRenderedHtml(html)
  setCached(text, sanitized)
  return sanitized
}

/**
 * 流式渲染：与 renderMarkdown 等价，不再追加打字机光标。
 * 仅供"正在流式输出的最后一条助手 text part"使用，保留独立函数以表达"流式"语义，
 * 便于将来在流式期间做特殊处理。
 */
export function renderMarkdownStreaming(text: string): string {
  return renderMarkdown(text)
}
