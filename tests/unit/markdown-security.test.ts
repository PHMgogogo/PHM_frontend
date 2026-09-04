import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/utils/useMarkdown'

describe('shared Markdown renderer security', () => {
  it('removes scripts, event handlers, active elements and dangerous URLs', () => {
    const html = renderMarkdown(`
<script>window.__xss = true</script>
<img src=x onerror="window.__xss = true">
[bad](javascript:window.__xss=true)
<iframe srcdoc="<script>window.__xss=true</script>"></iframe>
<form><input autofocus onfocus="window.__xss=true"></form>
`)

    const root = document.createElement('div')
    root.innerHTML = html
    expect(root.querySelector('script, iframe, form, input')).toBeNull()
    expect(root.querySelector('[onerror], [onfocus], [onclick]')).toBeNull()
    expect(root.querySelector('a[href^="javascript:"]')).toBeNull()
  })

  it('keeps code highlighting, tables, safe links and KaTeX', () => {
    const html = renderMarkdown(`
| 参数 | 值 |
| --- | --- |
| 温度 | 72 |

[manual](https://example.com/manual)

$E=mc^2$

\`\`\`python
print("safe")
\`\`\`
`)

    expect(html).toContain('<table>')
    expect(html).toContain('https://example.com/manual')
    expect(html).toContain('noopener')
    expect(html).toContain('katex')
    expect(html).toContain('hljs')
  })
})
