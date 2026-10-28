import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '@/utils/useMarkdown'

describe('renderMarkdown', () => {
  it('renders safe table HTML returned by the agent', () => {
    const html = renderMarkdown(`
<table border="1" style="border-collapse: collapse; width:100%">
<tr><th colspan="2">数据分布</th></tr>
<tr><td><b>剩余秒数</b></td><td>mean: 5.1s<br/>(实际值)</td></tr>
</table>
<hr/>
`)

    expect(html).toContain('<table')
    expect(html).toContain('<th colspan="2">数据分布</th>')
    expect(html).toContain('<b>剩余秒数</b>')
    expect(html).toContain('<br>')
    expect(html).toContain('<hr>')
    expect(html).not.toContain('&lt;table')
  })

  it('repairs broken Markdown tables with extra trailing pipes', () => {
    const html = renderMarkdown(`
| ✅✅ | Loss: *~1.84* <br>*(优化空间尚可)* ||
|---||
||
`)

    expect(html).toContain('<table>')
    expect(html).toContain('<th>✅✅</th>')
    expect(html).toContain('Loss: <em>~1.84</em> <br><em>')
    expect(html).not.toContain('|---|')
  })

  it('does not let an unclosed HTML table swallow following content', () => {
    const html = renderMarkdown(`
<table>
<tr><td>剩余秒数</td><td>5.1s</td></tr>

#### 后续内容

正文仍然可见。
`)

    expect(html).not.toContain('<table')
    expect(html).toContain('剩余秒数')
    expect(html).toContain('<h4>后续内容</h4>')
    expect(html).toContain('正文仍然可见')
  })

  it('closes an unclosed Mermaid fence before the next section', () => {
    const html = renderMarkdown(`
\`\`\`mermaid
---
classDef stats fill:#f6f,stroke:#333;
---

#### 推理性能总结

正文仍然可见。
`)

    expect(html).toContain('<h4>推理性能总结</h4>')
    expect(html).toContain('正文仍然可见')
    expect(html).not.toContain('#### 推理性能总结')
  })

  it('sanitizes unsafe HTML and URLs', () => {
    const html = renderMarkdown(`
<script>alert('xss')</script>
<img src="x" onerror="alert('xss')">
<iframe srcdoc="<script>alert('xss')</script>"></iframe>
<a href="javascript:alert('xss')">bad link</a>
`)

    expect(html).not.toMatch(/<script|<iframe|onerror|javascript:/i)
  })

  it('keeps normal Markdown tables working', () => {
    const html = renderMarkdown(`
| 字段 | 数值 |
|---|---:|
| 剩余秒数 | 5.1s |
`)

    expect(html).toContain('<table>')
    expect(html).toContain('<th>字段</th>')
    expect(html).toMatch(/<td[^>]*>5\.1s<\/td>/)
  })
})
