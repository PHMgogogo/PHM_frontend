import MarkdownIt from 'markdown-it'
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
  html: true,
  breaks: true,
  linkify: true,
  highlight: highlightCode,
})

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

  // 1. 保护 $$...$$ 块级公式
  let processed = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const id = `KATEX_${mathBlocks.size}`
    mathBlocks.set(id, { math: math.trim(), display: true })
    return `<span data-katex-id="${id}"></span>`
  })

  // 2. 保护 $...$ 行内公式（不匹配 $$）
  processed = processed.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, math) => {
    const id = `KATEX_${mathBlocks.size}`
    mathBlocks.set(id, { math: math.trim(), display: false })
    return `<span data-katex-id="${id}"></span>`
  })

  // 3. 渲染 Markdown
  let html = md.render(processed)

  // 4. 还原公式为 KaTeX HTML
  html = html.replace(/<span data-katex-id="([^"]+)"><\/span>/g, (_, id) => {
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

  setCached(text, html)
  return html
}

/**
 * 流式渲染：与 renderMarkdown 等价，不再追加打字机光标。
 * 仅供"正在流式输出的最后一条助手 text part"使用，保留独立函数以表达"流式"语义，
 * 便于将来在流式期间做特殊处理。
 */
export function renderMarkdownStreaming(text: string): string {
  return renderMarkdown(text)
}
