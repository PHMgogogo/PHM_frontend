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

async function prepareKnowledgeCenter(
  page: Page,
  listedDocuments = documents,
  installDocumentRoute = true,
): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  if (installDocumentRoute) {
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
  }
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

  await query.fill('尚未执行的草稿')
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
                contract_version: 2,
                history_persisted: true,
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
            contract_version: 2,
            session_id: 'session-e2e-001',
            total_messages: 2,
            complete: true,
            degraded: false,
            backend: 'combined',
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

test('registers only confirmed persisted v2 sessions and explains uncertain saves', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      const request = route.request().postDataJSON() as { message: string }
      const failed = request.message === '保存失败'
      const sessionId = failed ? 'session-not-saved' : 'session-save-unknown'
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'session', session_id: sessionId },
          {
            type: 'done',
            full_response: failed ? '回答已生成但未保存' : '回答已生成，保存状态未知',
            sources: [],
            processing_time_ms: 10,
            metadata: {
              contract_version: 2,
              history_persisted: failed ? false : null,
              route: 'general_chat',
            },
          },
        ),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await openAgent(page)

  await sendAgentQuestion(page, '保存失败')
  const failed = page.locator('.agent-message.assistant[data-run-state="completed"]').last()
  await expect(failed).toContainText('本次回答未保存到会话历史')
  expect(
    (await page.evaluate(() => localStorage.getItem('phm.knowledge.local-sessions.v1'))) ?? '',
  ).not.toContain('session-not-saved')

  await page.getByRole('button', { name: '新对话' }).click()
  await sendAgentQuestion(page, '保存未知')
  const unknown = page.locator('.agent-message.assistant[data-run-state="completed"]').last()
  await expect(unknown).toContainText('无法确认本次回答是否已保存')
  const stored = await page.evaluate(() => localStorage.getItem('phm.knowledge.local-sessions.v1'))
  expect(stored ?? '').not.toContain('session-not-saved')
  expect(stored ?? '').not.toContain('session-save-unknown')
})

test('keeps a persisted answer complete when device session storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function setItem(key: string, value: string) {
      if (key === 'phm.knowledge.local-sessions.v1') {
        throw new DOMException('blocked', 'QuotaExceededError')
      }
      return nativeSetItem.call(this, key, value)
    }
  })
  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'session', session_id: 'session-storage-blocked' },
          {
            type: 'done',
            full_response: '服务端回答仍然完成',
            sources: [],
            processing_time_ms: 10,
            metadata: {
              contract_version: 2,
              history_persisted: true,
              route: 'general_chat',
            },
          },
        ),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await openAgent(page)

  await sendAgentQuestion(page, '设备存储不可用')
  await expect(
    page.locator('.agent-message.assistant[data-run-state="completed"]'),
  ).toContainText('服务端回答仍然完成')
  await expect(page.getByTestId('agent-composer')).toContainText(
    '服务已保存 · 本设备未登记',
  )
  expect(
    await page.evaluate(() => localStorage.getItem('phm.knowledge.local-sessions.v1')),
  ).toBeNull()
})

test('keeps the session drawer open when history is incomplete and shows why', async ({ page }) => {
  const sessionId = 'session-incomplete-history'
  await page.addInitScript((storedSessionId) => {
    localStorage.setItem(
      'phm.knowledge.local-sessions.v1',
      JSON.stringify([{ id: storedSessionId, seenAt: Date.now() }]),
    )
  }, sessionId)
  await page.route(
    (url) => url.pathname === `/document/chat/history/${sessionId}`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contract_version: 2,
          session_id: sessionId,
          total_messages: 1,
          complete: false,
          degraded: true,
          backend: 'fallback',
          messages: [{ role: 'assistant', content: '部分恢复的历史回答', timestamp: 2 }],
        }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await openAgent(page)

  await page.getByRole('button', { name: '本设备会话' }).click()
  const drawer = page.getByRole('dialog', { name: '本设备会话' })
  await drawer.locator('.session-open').click()

  await expect(drawer).toBeVisible()
  await expect(drawer).toContainText('当前仅恢复了部分会话历史')
  await drawer.locator('.el-drawer__close-btn').click()
  await expect(page.getByText('部分恢复的历史回答')).toBeVisible()
})

test('keeps a failed local-history request visible and allows retry', async ({ page }) => {
  const sessionId = 'session-history-retry'
  let historyCalls = 0
  await page.addInitScript((storedSessionId) => {
    localStorage.setItem(
      'phm.knowledge.local-sessions.v1',
      JSON.stringify([{ id: storedSessionId, seenAt: Date.now() }]),
    )
  }, sessionId)
  await page.route(
    (url) => url.pathname === `/document/chat/history/${sessionId}`,
    async (route) => {
      historyCalls += 1
      if (historyCalls === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ session_id: sessionId }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          contract_version: 2,
          session_id: sessionId,
          total_messages: 2,
          complete: true,
          degraded: false,
          backend: 'combined',
          messages: [
            { role: 'user', content: '重试前的问题', timestamp: 1 },
            { role: 'assistant', content: '重试后恢复的回答', timestamp: 2 },
          ],
        }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await openAgent(page)

  await page.getByRole('button', { name: '本设备会话' }).click()
  const drawer = page.getByRole('dialog', { name: '本设备会话' })
  await drawer.locator('.session-open').click()

  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('会话历史响应格式无效')).toBeVisible()
  await drawer.locator('.session-open').click()

  await expect(drawer).toBeHidden()
  await expect(page.getByText('重试后恢复的回答')).toBeVisible()
  expect(historyCalls).toBe(2)
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

test('rejects malformed successful envelopes and preserves partial answers', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/document/documents',
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>proxy error</html>' })
    },
  )
  await page.route(
    (url) => url.pathname === '/document/retrieval',
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    },
  )
  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'session', session_id: 'session-invalid-done' },
          { type: 'token', content: '必须保留的部分回答' },
          { type: 'done' },
        ),
      })
    },
  )
  await prepareKnowledgeCenter(page, [], false)

  await expect(page.getByText(/文档列表响应格式无效/)).toBeVisible()

  await page.getByRole('tab', { name: '检索验证' }).click()
  await page.getByPlaceholder(/主轴承温度持续升高/).fill('畸形响应检查')
  await page.getByRole('button', { name: '执行验证' }).click()
  await expect(page.getByText('检索响应格式无效')).toBeVisible()
  await expect(page.getByText('未找到匹配证据')).toHaveCount(0)

  await openAgent(page)
  await sendAgentQuestion(page, '非法终帧')
  const interrupted = page.locator('.agent-message.assistant[data-run-state="interrupted"]')
  await expect(interrupted).toContainText('必须保留的部分回答')
  await expect(interrupted).toContainText('回答在完成前中断')
  await expect(interrupted.getByRole('button', { name: '使用同一问题重试' })).toBeVisible()
})

test('keeps pagination data owned by the latest requested page', async ({ page }) => {
  const firstPage = Array.from({ length: 20 }, (_, index) => ({
    ...documents[1],
    id: `page-1-${index}`,
    filename: `page-1-${index}.md`,
  }))
  const secondPage = [{ ...documents[1], id: 'page-2-only', filename: 'page-2-only.md' }]
  let firstPageCalls = 0
  let releaseRefresh: (() => void) | undefined
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve
  })

  await page.route(
    (url) => url.pathname === '/document/documents',
    async (route) => {
      const skip = Number(new URL(route.request().url()).searchParams.get('skip') || '0')
      if (skip === 20) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: 21, documents: secondPage }),
        })
        return
      }
      firstPageCalls += 1
      if (firstPageCalls === 2) await refreshGate
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ total: 21, documents: firstPage }),
        })
      } catch {
        // Superseded page-one request is expected to be aborted.
      }
    },
  )
  await prepareKnowledgeCenter(page, [], false)
  await expect(page.getByText('page-1-0.md')).toBeVisible()

  await page.getByRole('button', { name: '刷新' }).click()
  await expect.poll(() => firstPageCalls).toBe(2)
  await page.locator('.el-pager li').filter({ hasText: '2' }).click()
  await expect(page.getByText('page-2-only.md')).toBeVisible()
  await expect(page.locator('.el-pager li.is-active')).toHaveText('2')

  releaseRefresh?.()
  await expect(page.getByText('page-2-only.md')).toBeVisible()
  await expect(page.getByText('page-1-0.md')).toHaveCount(0)
})

test('keeps the newest retrieval request in control while the old request aborts', async ({
  page,
}) => {
  let calls = 0
  let releaseFirst: (() => void) | undefined
  let releaseSecond: (() => void) | undefined
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  const secondGate = new Promise<void>((resolve) => {
    releaseSecond = resolve
  })

  await page.route(
    (url) => url.pathname === '/document/retrieval',
    async (route) => {
      calls += 1
      const body = route.request().postDataJSON() as { query: string }
      await (calls === 1 ? firstGate : secondGate)
      try {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            query: body.query,
            total: 1,
            retrieval_time_ms: 2,
            results: [{ content: `${body.query} 的结果`, source: `${body.query}.pdf` }],
          }),
        })
      } catch {
        // The first request is expected to be aborted by the second.
      }
    },
  )
  await prepareKnowledgeCenter(page, [])
  await page.getByRole('tab', { name: '检索验证' }).click()
  const input = page.getByPlaceholder(/主轴承温度持续升高/)
  const submit = page.getByRole('button', { name: '执行验证' })

  await input.fill('旧查询')
  await input.press('Control+Enter')
  await expect.poll(() => calls).toBe(1)
  await input.fill('新查询')
  await input.press('Control+Enter')
  await expect.poll(() => calls).toBe(2)
  await expect(submit).toHaveClass(/is-loading/)

  releaseFirst?.()
  await expect(submit).toHaveClass(/is-loading/)
  releaseSecond?.()
  await expect(page.getByTestId('retrieval-results')).toContainText('新查询 的结果')
  await expect(page.getByTestId('retrieval-results')).not.toContainText('旧查询 的结果')
})

test('@mutations keeps document deletion guarded and reports stale refreshes honestly', async ({
  page,
}) => {
  const deletableId = 'doc/a b'
  const listed = [
    documents[0],
    { ...documents[0], id: 'unknown-doc', filename: 'unknown.md', status: 'unexpected' },
    { ...documents[1], id: deletableId, filename: 'delete-me.md' },
  ]
  let deleteCalls = 0
  let listCalls = 0
  let deleteUrl = ''
  await page.route(
    (url) => url.pathname === '/document/documents',
    async (route) => {
      listCalls += 1
      if (listCalls > 1) {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ detail: '列表刷新暂时失败' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ total: listed.length, documents: listed }),
      })
    },
  )
  await page.route(
    (url) => url.pathname.startsWith('/document/documents/'),
    async (route) => {
      deleteCalls += 1
      deleteUrl = route.request().url()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'success', message: 'accepted' }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [], false)

  await expect(page.getByRole('button', { name: '删除 processing.pdf' })).toBeDisabled()
  await expect(page.getByRole('button', { name: '删除 unknown.md' })).toBeDisabled()
  const deleteButton = page.getByRole('button', { name: '删除 delete-me.md' })
  await deleteButton.click()
  let confirmation = page.getByRole('dialog', { name: '确认删除请求' })
  await confirmation.getByRole('button', { name: '取消' }).click()
  expect(deleteCalls).toBe(0)

  await deleteButton.click()
  confirmation = page.getByRole('dialog', { name: '确认删除请求' })
  await confirmation.getByRole('button', { name: '提交删除请求' }).click()
  await expect(page.getByText('服务已接受删除请求，但列表刷新失败；当前显示的是旧数据')).toBeVisible()
  expect(deleteCalls).toBe(1)
  expect(deleteUrl).toContain('/document/documents/doc%2Fa%20b')
  await expect(page.getByRole('heading', { name: 'delete-me.md', exact: true })).toBeVisible()
})

test('@mutations distinguishes registered ingestion failure from a transport retry', async ({
  page,
}) => {
  let uploadCalls = 0
  let deleteCalls = 0
  await page.route(
    (url) => url.pathname === '/document/documents/upload',
    async (route) => {
      uploadCalls += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: uploadCalls === 1 ? 'failed-registration' : 'retry-registration',
          filename: 'failed.pdf',
          status: 'processing',
          message: 'accepted',
        }),
      })
    },
  )
  await page.route(
    (url) => url.pathname === '/document/documents/failed-registration',
    async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalls += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'success', message: 'accepted' }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...documents[2],
          id: 'failed-registration',
          filename: 'failed.pdf',
        }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await page.locator('input[type=file]').setInputFiles({
    name: 'failed.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('failed'),
  })

  const queue = page.getByTestId('upload-queue')
  await expect(queue.getByRole('button', { name: '删除后重传' })).toBeVisible({ timeout: 6_000 })
  await expect(queue.getByRole('button', { name: '重试上传' })).toHaveCount(0)
  await queue.getByRole('button', { name: '删除后重传' }).click()
  const confirmation = page.getByRole('dialog', { name: '确认删除后重传' })
  await confirmation.getByRole('button', { name: '删除后重传' }).click()

  await expect.poll(() => uploadCalls).toBe(2)
  expect(deleteCalls).toBe(1)
})

test('@mutations makes feedback single-flight and validates all feedback outcomes', async ({
  page,
}) => {
  let answerIndex = 0
  const feedbackBodies: Array<Record<string, unknown>> = []
  let releaseFirst: (() => void) | undefined
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })
  let correctionAttempts = 0

  await page.route(
    (url) => url.pathname === '/document/chat/stream',
    async (route) => {
      answerIndex += 1
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse(
          { type: 'session', session_id: 'session-feedback-audit' },
          {
            type: 'done',
            full_response: `反馈回答 ${answerIndex}`,
            sources: [],
            metadata: {
              route: 'rag',
              message_id: `message-feedback-${answerIndex}`,
              trace_id: `trace-feedback-${answerIndex}`,
            },
          },
        ),
      })
    },
  )
  await page.route(
    (url) => url.pathname === '/document/feedback',
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>
      feedbackBodies.push(body)
      if (body.message_id === 'message-feedback-1') await firstGate
      if (body.feedback_type === 'CORRECTION') {
        correctionAttempts += 1
        if (correctionAttempts === 1) {
          await route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ detail: '纠正暂时失败' }),
          })
          return
        }
      }
      if (body.message_id === 'message-feedback-2' && body.feedback_type === 'THUMBS_DOWN') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', id: `feedback-${feedbackBodies.length}` }),
      })
    },
  )
  await prepareKnowledgeCenter(page, [])
  await openAgent(page)

  await sendAgentQuestion(page, '并发点赞')
  let answer = page.locator('.agent-message.assistant').last()
  const helpful = answer.getByRole('button', { name: '有帮助' })
  await helpful.dblclick()
  await expect.poll(() => feedbackBodies.length).toBe(1)
  await expect(helpful).toBeDisabled()
  releaseFirst?.()
  await expect(answer).toContainText('反馈已提交')

  await sendAgentQuestion(page, '畸形点踩响应')
  answer = page.locator('.agent-message.assistant').last()
  await answer.getByRole('button', { name: '无帮助' }).click()
  await expect(page.getByText('反馈响应格式无效')).toBeVisible()
  await expect(answer.getByRole('button', { name: '无帮助' })).toBeVisible()
  await answer.getByRole('button', { name: '标记' }).click()
  await expect(answer).toContainText('反馈已提交')

  await sendAgentQuestion(page, '纠正失败后重试')
  answer = page.locator('.agent-message.assistant').last()
  await answer.getByRole('button', { name: '纠正' }).click()
  const correction = page.getByRole('dialog', { name: '提供纠正答案' })
  const correctionInput = correction.getByPlaceholder('填写你认为更准确的答案')
  await expect(correction.getByRole('button', { name: '提交纠正' })).toBeDisabled()
  await correctionInput.fill('保留这段纠正内容')
  await correction.getByRole('button', { name: '提交纠正' }).click()
  await expect(page.getByText('纠正暂时失败')).toBeVisible()
  await expect(correctionInput).toHaveValue('保留这段纠正内容')
  await correction.getByRole('button', { name: '提交纠正' }).click()
  await expect(correction).toBeHidden()

  expect(feedbackBodies.map((body) => body.feedback_type)).toEqual([
    'THUMBS_UP',
    'THUMBS_DOWN',
    'FLAG',
    'CORRECTION',
    'CORRECTION',
  ])
})

test('keeps document and retrieval workbench geometry usable at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.route(
    (url) => url.pathname === '/document/retrieval',
    async (route) => {
      const body = route.request().postDataJSON() as { query: string }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          query: body.query,
          total: 1,
          retrieval_time_ms: 3,
          results: [{
            content: '窄屏下仍能完整阅读的证据片段。',
            source: 'responsive-manual.pdf',
            score: 0.8,
          }],
        }),
      })
    },
  )
  await prepareKnowledgeCenter(page)

  for (const locator of [page.locator('.stats-grid'), page.locator('.document-panel')]) {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(769)
  }

  await page.getByRole('tab', { name: '检索验证' }).click()
  await page.getByPlaceholder(/主轴承温度持续升高/).fill('窄屏检索')
  await page.getByRole('button', { name: '执行验证' }).click()
  await expect(page.getByTestId('retrieval-results')).toContainText('responsive-manual.pdf')
  for (const locator of [page.locator('.query-card'), page.getByTestId('retrieval-results')]) {
    const box = await locator.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(769)
    expect(await locator.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
      true,
    )
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})
