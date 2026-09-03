import { expect, test, type Page } from '@playwright/test'

const documents = [
  {
    id: 'p',
    filename: 'processing.pdf',
    status: 'processing',
    chunks: 0,
    created_at: 1,
    size_bytes: 10,
    file_hash: 'p',
  },
  {
    id: 'i',
    filename: 'indexed.md',
    status: 'indexed',
    chunks: 4,
    created_at: 2,
    size_bytes: 20,
    file_hash: 'i',
  },
  {
    id: 'f',
    filename: 'failed.docx',
    status: 'failed',
    chunks: 0,
    created_at: 3,
    size_bytes: 30,
    file_hash: 'f',
  },
]

function sse(...events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`
}

async function prepareKnowledgeCenter(page: Page, listedDocuments = documents): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(
    (url) => url.pathname === '/document/documents',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: listedDocuments.length, documents: listedDocuments }),
      })
    },
  )
  await page.goto('./')
  await page.getByText('知识库管理', { exact: true }).click()
  await expect(page.getByTestId('knowledge-center')).toBeVisible()
}

async function openAgent(page: Page): Promise<void> {
  await page.getByRole('tab', { name: '知识库 Agent' }).click()
  await expect(page.getByRole('tab', { name: '知识库 Agent' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

async function sendAgentQuestion(page: Page, question: string): Promise<void> {
  const input = page.getByPlaceholder('输入问题；Enter 发送，Shift+Enter 换行')
  await input.fill(question)
  await page.getByRole('button', { name: '发送' }).click()
}

test('shows honest document lifecycle states and defaults to read-only mutations', async ({ page }) => {
  await prepareKnowledgeCenter(page)

  await expect(page.getByRole('tab', { name: '文档库' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '检索验证' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '知识库 Agent' })).toBeVisible()

  await expect(page.locator('.document-card').filter({ hasText: 'processing.pdf' })).toContainText(
    '处理中',
  )
  await expect(page.locator('.document-card').filter({ hasText: 'indexed.md' })).toContainText(
    '已索引',
  )
  await expect(page.locator('.document-card').filter({ hasText: 'failed.docx' })).toContainText(
    '处理失败',
  )
  await expect(page.getByText('当前知识库为只读模式')).toBeVisible()
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^删除 / })).toHaveCount(0)
})

test('runs all low-level retrieval strategies and hands only the query to Agent', async ({ page }) => {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = []
  await page.route(
    (url) => url.pathname.startsWith('/document/retrieval'),
    async (route) => {
      requests.push({
        path: new URL(route.request().url()).pathname,
        body: route.request().postDataJSON() as Record<string, unknown>,
      })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: '轴承温度',
          total: 1,
          retrieval_time_ms: 12.3,
          results: [
            {
              title: '轴承手册',
              source: 'bearing.pdf',
              content: '温度与振动同时升高时检查润滑与保持架。',
              score: 0,
              retrieval_score: 0.87,
              rerank_score: null,
              rerank_applied: true,
            },
          ],
        }),
      })
    },
  )
  await prepareKnowledgeCenter(page, documents.slice(1, 2))
  await page.getByRole('tab', { name: '检索验证' }).click()

  const query = page.getByPlaceholder(/主轴承温度持续升高/)
  await query.fill('轴承温度')
  await page.getByRole('button', { name: '执行验证' }).click()
  await expect(page.getByTestId('retrieval-results')).toContainText('未确认（服务返回 0）')
  await expect(page.getByTestId('retrieval-results')).toContainText('检索分数：0.8700')
  await expect(page.getByTestId('retrieval-results')).toContainText('重排分数：未提供')

  await page.getByText('纯向量', { exact: true }).click()
  await page.getByRole('button', { name: '执行验证' }).click()
  await page.getByText('纯关键词', { exact: true }).click()
  await page.getByRole('button', { name: '执行验证' }).click()

  await expect.poll(() => requests.length).toBe(3)
  expect(requests.map((request) => request.path)).toEqual([
    '/document/retrieval',
    '/document/retrieval/dense',
    '/document/retrieval/sparse',
  ])
  expect(requests.every((request) => request.body.top_k === 5)).toBe(true)

  await page.getByRole('button', { name: '交给 Agent 分析' }).click()
  await expect(page.getByRole('tab', { name: '知识库 Agent' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByPlaceholder('输入问题；Enter 发送，Shift+Enter 换行')).toHaveValue(
    '轴承温度',
  )
})

test('renders final Agent trust data, sources, local history, and blocks XSS', async ({ page }) => {
  const requestedPaths: string[] = []
  await page.route(
    (url) => url.pathname.startsWith('/document/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname
      requestedPaths.push(path)
      if (path === '/document/chat/stream') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sse(
            { type: 'session', session_id: 'session-e2e-001' },
            { type: 'status', message: '正在分析意图' },
            { type: 'intent', intent: 'diagnosis', confidence: 0.8, route: 'rag', force_rag: true },
            { type: 'node', name: 'retrieve' },
            { type: 'node', name: 'grade' },
            { type: 'node', name: 'rewrite' },
            { type: 'node', name: 'generate' },
            { type: 'token', content: '临时回答' },
            {
              type: 'done',
              full_response:
                '**最终回答** [危险链接](javascript:window.__xss=true) <img src=x onerror="window.__xss=true">',
              processing_time_ms: 1250,
              sources: [
                {
                  title: '维护手册',
                  source: 'manual.pdf',
                  content: '<img src=x onerror="window.__xss=true">证据正文',
                  score: 0.91,
                  retrieval_score: 0.82,
                  rerank_score: 0.93,
                  rerank_applied: true,
                },
              ],
              metadata: {
                route: 'rag',
                confidence: null,
                confidence_level: 'unknown',
                refused: true,
                force_rag: true,
                message_id: 'message-e2e-001',
                trace_id: 'trace-e2e-001',
                reasoning: 'SECRET_REASONING_SENTINEL',
                structured_answer: {
                  summary: '需要进一步验证',
                  details: ['检查温度趋势'],
                  steps: ['核对润滑状态'],
                  notes: '不要仅凭单点数据',
                  sources: ['维护手册'],
                  gaps: '缺少连续振动谱',
                },
                section_labels: ['诊断摘要', '现象依据', '建议步骤', '注意事项', '引用资料', '证据缺口'],
              },
            },
          ),
        })
        return
      }
      if (path === '/document/chat/history/session-e2e-001') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session_id: 'session-e2e-001',
            total_messages: 2,
            messages: [
              { role: 'user', content: '历史问题', timestamp: 1 },
              { role: 'assistant', content: '历史回答', timestamp: 2 },
            ],
          }),
        })
        return
      }
      await route.fallback()
    },
  )
  await prepareKnowledgeCenter(page, documents.slice(1, 2))
  await openAgent(page)
  await sendAgentQuestion(page, '完整流程')

  const completed = page.locator('.agent-message.assistant[data-run-state="completed"]')
  await expect(completed).toContainText('最终回答')
  await expect(completed).not.toContainText('临时回答')
  await expect(completed).toContainText('意图分析')
  await expect(completed).toContainText('知识检索')
  await expect(completed).toContainText('证据评估')
  await expect(completed).toContainText('查询优化')
  await expect(completed).toContainText('生成回答')
  await expect(completed).toContainText('知识库路径')
  await expect(completed).toContainText('置信度：未评估')
  await expect(completed).toContainText('可信等级：unknown')
  await expect(completed).toContainText('证据不足或存在冲突')
  await expect(completed).toContainText('自动切换知识库')
  await expect(completed).toContainText('当前部署未启用反馈写入')

  await completed.getByText('结构化诊断视图').click()
  await expect(completed.getByText('诊断摘要')).toBeVisible()
  await expect(completed.getByText('证据缺口')).toBeVisible()

  await completed.getByRole('button', { name: '查看 1 条依据' }).click()
  const sourceDrawer = page.locator('.el-drawer').filter({ hasText: '回答依据' })
  await expect(sourceDrawer).toContainText('manual.pdf')
  await expect(sourceDrawer).toContainText('<img src=x onerror="window.__xss=true">证据正文')
  await expect(sourceDrawer.locator('img')).toHaveCount(0)
  await sourceDrawer.locator('.el-drawer__close-btn').click()

  expect(
    await page.evaluate(
      () => (window as Window & { __xss?: unknown }).__xss,
    ),
  ).toBeUndefined()
  await expect(page.locator('body')).not.toContainText('SECRET_REASONING_SENTINEL')

  const stored = await page.evaluate(() =>
    localStorage.getItem('phm.knowledge.local-sessions.v1'),
  )
  expect(stored).toContain('session-e2e-001')
  expect(stored).not.toContain('完整流程')
  expect(stored).not.toContain('trace-e2e-001')

  await page.getByRole('button', { name: '本设备会话' }).click()
  await expect(page.getByText('这里只列出本浏览器收到过的会话 ID')).toBeVisible()
  await page.locator('.session-open').filter({ hasText: 'session-e2e-001' }).click()
  await expect(page.getByText('历史回答')).toBeVisible()
  await expect(page.getByText('历史接口仅恢复文本')).toBeVisible()
  expect(requestedPaths).not.toContain('/document/sessions')
})

test('uses done as final route authority and retries an EOF-interrupted answer', async ({ page }) => {
  let interruptedCalls = 0
  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      const request = route.request().postDataJSON() as { message: string }
      if (request.message === '最终路由') {
        await route.fulfill({
          status: 200,
          contentType: 'text/event-stream',
          body: sse(
            { type: 'session', session_id: 'session-route' },
            { type: 'intent', intent: 'qa', confidence: 0.9, route: 'rag', force_rag: false },
            {
              type: 'done',
              full_response: '通用路径最终回答',
              sources: [{ source: 'should-not-display.pdf', content: 'not final evidence' }],
              metadata: { route: 'general_chat', confidence: 0.4 },
            },
          ),
        })
        return
      }

      interruptedCalls += 1
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body:
          interruptedCalls === 1
            ? sse({ type: 'token', content: '保留的部分回答' })
            : sse({
                type: 'done',
                full_response: '重试完成',
                sources: [],
                metadata: { route: 'rag', confidence: 0.7 },
              }),
      })
    },
  )
  await prepareKnowledgeCenter(page, documents.slice(1, 2))
  await openAgent(page)

  await sendAgentQuestion(page, '最终路由')
  const firstAnswer = page.locator('.agent-message.assistant').first()
  await expect(firstAnswer).toContainText('通用对话路径')
  await expect(firstAnswer).not.toContainText('知识库路径')
  await expect(firstAnswer.getByRole('button', { name: /查看 .* 条依据/ })).toHaveCount(0)

  await sendAgentQuestion(page, '中断问题')
  const interrupted = page.locator('.agent-message.assistant[data-run-state="interrupted"]')
  await expect(interrupted).toContainText('保留的部分回答')
  await expect(interrupted).toContainText('回答在完成前中断')
  await interrupted.getByRole('button', { name: '使用同一问题重试' }).click()
  await expect(page.locator('.agent-message.assistant').last()).toContainText('重试完成')
})

test('keeps retrieval state on errors and presents Fast degraded runs honestly', async ({ page }) => {
  let retrievalCalls = 0
  let chatBody: Record<string, unknown> | undefined
  await page.route(
    (url) => url.pathname === '/document/retrieval',
    async (route) => {
      retrievalCalls += 1
      if (retrievalCalls === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            query: '不存在的故障码',
            results: [],
            total: 0,
            retrieval_time_ms: 3,
          }),
        })
        return
      }
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ detail: '检索服务维护中' }),
      })
    },
  )
  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      chatBody = route.request().postDataJSON() as Record<string, unknown>
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'intent', intent: 'qa', confidence: 0.5, route: 'rag', force_rag: false },
          { type: 'node', name: 'grade' },
          { type: 'node', name: 'rewrite' },
          { type: 'node', name: 'retrieve' },
          { type: 'node', name: 'fast_generate' },
          {
            type: 'done',
            full_response: '服务降级时的有限回答',
            sources: [{ source: 'not-final-evidence.pdf', content: '不可作为正常依据展示' }],
            metadata: { route: 'degraded', confidence: null },
          },
        ),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await page.getByRole('tab', { name: '检索验证' }).click()

  const retrievalInput = page.getByPlaceholder(/主轴承温度持续升高/)
  await retrievalInput.fill('不存在的故障码')
  await page.getByRole('button', { name: '执行验证' }).click()
  await expect(page.getByText('未找到匹配证据')).toBeVisible()
  await page.getByRole('button', { name: '执行验证' }).click()
  await expect(page.getByText('检索服务维护中')).toBeVisible()
  await expect(retrievalInput).toHaveValue('不存在的故障码')

  await openAgent(page)
  await page.getByText('Fast', { exact: true }).click()
  await sendAgentQuestion(page, '快速降级问题')

  const answer = page.locator('.agent-message.assistant[data-run-state="completed"]')
  await expect(answer).toContainText('知识检索')
  await expect(answer).toContainText('生成回答')
  await expect(answer).not.toContainText('意图分析')
  await expect(answer).not.toContainText('证据评估')
  await expect(answer).not.toContainText('查询优化')
  await expect(answer).toContainText('本回答来自降级路径')
  await expect(answer).toContainText('置信度：未评估')
  await expect(answer.getByRole('button', { name: /查看 .* 条依据/ })).toHaveCount(0)
  expect(chatBody).toMatchObject({ mode: 'fast', include_sources: true, stream: true })
})

test('@mutations continues a multi-file upload after one duplicate response', async ({ page }) => {
  let uploadCalls = 0
  await page.route(
    (url) => url.pathname === '/document/documents/upload',
    async (route) => {
      uploadCalls += 1
      if (uploadCalls === 1) {
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ detail: '相同内容的文件已存在' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'new-document',
          filename: 'new.pdf',
          status: 'processing',
          message: 'accepted',
        }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])

  await page.locator('input[type=file]').setInputFiles([
    { name: 'duplicate.pdf', mimeType: 'application/pdf', buffer: Buffer.from('duplicate') },
    { name: 'new.pdf', mimeType: 'application/pdf', buffer: Buffer.from('new') },
  ])

  const queue = page.getByTestId('upload-queue')
  await expect(queue).toContainText('duplicate.pdf')
  await expect(queue).toContainText('已存在')
  await expect(queue).toContainText('相同内容的文件已存在')
  await expect(queue).toContainText('new.pdf')
  await expect(queue).toContainText('后台处理中')
  expect(uploadCalls).toBe(2)
})

test('@mutations submits feedback only with server-owned identifiers', async ({ page }) => {
  const feedbackBodies: Array<Record<string, unknown>> = []
  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'session', session_id: 'session-feedback' },
          {
            type: 'done',
            full_response: '可反馈回答',
            sources: [],
            metadata: {
              route: 'rag',
              confidence: 0.8,
              message_id: 'message-feedback',
              trace_id: 'trace-feedback',
            },
          },
        ),
      })
    },
  )
  await page.route(
    (url) => url.pathname === '/document/feedback',
    async (route) => {
      feedbackBodies.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', id: 'feedback-1' }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await openAgent(page)
  await sendAgentQuestion(page, '反馈问题')

  const answer = page.locator('.agent-message.assistant[data-run-state="completed"]')
  await answer.getByRole('button', { name: '有帮助' }).click()
  await expect(answer).toContainText('反馈已提交')
  expect(feedbackBodies).toEqual([
    expect.objectContaining({
      session_id: 'session-feedback',
      message_id: 'message-feedback',
      trace_id: 'trace-feedback',
      feedback_type: 'THUMBS_UP',
      original_answer: '可反馈回答',
    }),
  ])
  await expect(answer.getByRole('button', { name: '有帮助' })).toHaveCount(0)
})
