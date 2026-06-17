import MarkdownIt from 'markdown-it'
import { renderToString } from 'katex'

const md = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true,
})

/**
 * 渲染 Markdown 文本为 HTML，支持：
 * - 标准 Markdown（标题、加粗、斜体、列表、表格、代码块、链接等）
 * - LaTeX 行内公式：$E=mc^2$
 * - LaTeX 块级公式：$$\int_0^1 x^2 dx$$
 */
export function renderMarkdown(text: string): string {
  if (!text) return ''

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

  return html
}
