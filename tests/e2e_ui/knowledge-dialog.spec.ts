import { expect, test, type Locator, type Page } from '@playwright/test'

interface StreamControl {
  push: (event: unknown) => void
  close: () => void
}

type ControlledWindow = Window & { __knowledgeStreamControl: StreamControl }

function sse(...events: unknown[]): string {
  return `${events.map((event) => `data: ${JSON.stringify(event)}`).join('\n\n')}\n\n`
}

function finalEvent(content: string) {
  return {
    type: 'done',
    full_response: content,
    processing_time_ms: 920,
    sources: [
      {
        title: '维护手册',
        source: 'manual.pdf',
        content: '检查润滑状态与保持架磨损。',
        score: 0.91,
        retrieval_score: 0.86,
        rerank_score: 0.93,
        rerank_applied: true,
      },
    ],
    metadata: {
      route: 'rag',
      confidence: 0.86,
      confidence_level: 'high',
      message_id: 'dialog-message',
      trace_id: 'dialog-trace',
    },
  }
}

async function prepareKnowledgeAgent(page: Page): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route((url) => url.pathname === '/document/documents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 0, documents: [] }),
    })
  })
  await page.goto('./')
  await page.getByText('知识库管理', { exact: true }).click()
  await page.getByRole('tab', { name: '知识库 Agent' }).click()
  await expect(page.getByRole('tab', { name: '知识库 Agent' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
}

async function sendQuestion(page: Page, question: string): Promise<void> {
  const input = page.getByPlaceholder('输入问题；Enter 发送，Shift+Enter 换行')
  await input.fill(question)
  await page.getByRole('button', { name: '发送' }).click()
}

async function boundingBox(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

async function expectInside(child: Locator, parent: Locator): Promise<void> {
  const childBox = await boundingBox(child)
  const parentBox = await boundingBox(parent)
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - 1)
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(parentBox.x + parentBox.width + 1)
}

async function installControlledStream(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    const encoder = new TextEncoder()
    const queued: Uint8Array[] = []
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null
    let shouldClose = false

    const control: StreamControl = {
      push(event) {
        const chunk = encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        if (controller) controller.enqueue(chunk)
        else queued.push(chunk)
      },
      close() {
        shouldClose = true
        if (controller) controller.close()
      },
    }
    Object.defineProperty(window, '__knowledgeStreamControl', {
      configurable: true,
      value: control,
    })

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (new URL(rawUrl, window.location.href).pathname !== '/document/chat/stream') {
        return originalFetch(input, init)
      }
      const stream = new ReadableStream<Uint8Array>({
        start(value) {
          controller = value
          for (const chunk of queued.splice(0)) value.enqueue(chunk)
          if (shouldClose) value.close()
          init?.signal?.addEventListener(
            'abort',
            () => value.error(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        },
        cancel() {
          controller = null
        },
      })
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }
  })
}

async function pushEvent(page: Page, event: unknown): Promise<void> {
  await page.evaluate(
    (payload) => (window as ControlledWindow).__knowledgeStreamControl.push(payload),
    event,
  )
}

test('uses compact directional message geometry and accessible conversation semantics', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.route((url) => url.pathname === '/document/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse(
        { type: 'status', message: '正在分析意图' },
        { type: 'node', name: 'retrieve' },
        finalEvent('温度与振动同步升高，建议优先检查润滑状态。'),
      ),
    })
  })
  await prepareKnowledgeAgent(page)
  await sendQuestion(page, '主轴承温度持续升高如何诊断？')

  const feed = page.getByTestId('agent-message-feed')
  const user = page.locator('.agent-message.user')
  const assistant = page.locator('.agent-message.assistant[data-run-state="completed"]')
  const userBody = user.locator('.message-body')
  const userAvatar = user.locator('.message-avatar')
  const assistantBody = assistant.locator('.message-body')
  const assistantAvatar = assistant.locator('.message-avatar')
  await expect(assistant).toContainText('温度与振动同步升高')

  const userBox = await boundingBox(user)
  const userBodyBox = await boundingBox(userBody)
  const userAvatarBox = await boundingBox(userAvatar)
  const assistantBodyBox = await boundingBox(assistantBody)
  const assistantAvatarBox = await boundingBox(assistantAvatar)
  expect(userAvatarBox.x).toBeGreaterThan(userBodyBox.x + userBodyBox.width)
  expect(userBodyBox.width).toBeLessThanOrEqual(userBox.width * 0.72 + 1)
  expect(assistantAvatarBox.x + assistantAvatarBox.width).toBeLessThan(assistantBodyBox.x)
  await expect(user.getByText('用户', { exact: true })).toHaveCount(0)
  await expect(user.locator('time')).toHaveCount(1)
  await expect(userAvatar).toHaveAttribute('aria-hidden', 'true')
  await expect(feed).toHaveAttribute('role', 'log')
  await expect(feed).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByRole('status')).toContainText('回答完成')
})

test('does not yank an older reading position and can return to the latest answer', async ({
  page,
}) => {
  await installControlledStream(page)
  await prepareKnowledgeAgent(page)
  await sendQuestion(page, '持续输出测试')
  await pushEvent(page, { type: 'status', message: '正在检索知识库' })
  const longAnswer = Array.from(
    { length: 90 },
    (_, index) => `证据段 ${index + 1}：保持当前阅读位置。`,
  ).join('\n\n')
  await pushEvent(page, { type: 'token', content: longAnswer })

  const feed = page.getByTestId('agent-message-feed')
  await expect(page.locator('.agent-message.assistant')).toContainText('证据段 90')
  await expect
    .poll(() =>
      feed.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThanOrEqual(2)

  await feed.evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  const previousTop = await feed.evaluate((element) => element.scrollTop)
  await expect(page.getByRole('button', { name: '回到最新回答' })).toBeVisible()

  await pushEvent(page, { type: 'token', content: '\n\n新增证据：不得抢走阅读位置。' })
  await expect(page.locator('.agent-message.assistant')).toContainText('新增证据')
  await expect.poll(() => feed.evaluate((element) => element.scrollTop)).toBe(previousTop)

  await page.getByRole('button', { name: '回到最新回答' }).click()
  await expect
    .poll(() =>
      feed.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight),
    )
    .toBeLessThanOrEqual(2)
  await pushEvent(page, finalEvent(`${longAnswer}\n\n新增证据：不得抢走阅读位置。`))
  await page.evaluate(() => (window as ControlledWindow).__knowledgeStreamControl.close())
  await expect(page.locator('.agent-message.assistant[data-run-state="completed"]')).toBeVisible()
})

test('shows only honest zero-token terminal states', async ({ page }) => {
  let requestNumber = 0
  await page.route((url) => url.pathname === '/document/chat/stream', async (route) => {
    requestNumber += 1
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: requestNumber === 1 ? '' : sse({ type: 'error', message: '知识服务暂时不可用' }),
    })
  })
  await prepareKnowledgeAgent(page)

  await sendQuestion(page, '首片段前中断')
  const interrupted = page.locator('.agent-message.assistant[data-run-state="interrupted"]')
  await expect(interrupted).toContainText('回答在完成前中断')
  await expect(interrupted).not.toContainText('正在等待首个回答片段')
  await interrupted.getByRole('button', { name: '使用同一问题重试' }).click()
  const error = page.locator('.agent-message.assistant[data-run-state="error"]')
  await expect(error).toContainText('知识服务暂时不可用')
  await expect(error).not.toContainText('正在等待首个回答片段')
})

test('does not submit while a Chinese IME composition is being confirmed', async ({ page }) => {
  let requests = 0
  await page.route((url) => url.pathname === '/document/chat/stream', async (route) => {
    requests += 1
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: '' })
  })
  await prepareKnowledgeAgent(page)
  const input = page.getByPlaceholder('输入问题；Enter 发送，Shift+Enter 换行')
  await input.fill('轴承温度')
  await input.evaluate((element) => {
    element.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Enter',
        isComposing: true,
        key: 'Enter',
      }),
    )
  })
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
  expect(requests).toBe(0)
  await expect(input).toHaveValue('轴承温度')

  await input.press('Shift+Enter')
  expect(requests).toBe(0)
  await input.press('Enter')
  await expect.poll(() => requests).toBe(1)
})

test('keeps every dialog control inside the panel at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await page.route((url) => url.pathname === '/document/chat/stream', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse(finalEvent('窄屏回答')),
    })
  })
  await prepareKnowledgeAgent(page)
  await sendQuestion(page, '窄屏布局')
  await expect(page.locator('.agent-message.assistant[data-run-state="completed"]')).toBeVisible()

  const panel = page.locator('.agent-panel')
  const internalRegions = [
    page.getByTestId('agent-toolbar'),
    page.getByTestId('agent-message-stage'),
    page.getByTestId('agent-composer'),
  ]
  for (const region of internalRegions) {
    await expectInside(region, panel)
    expect(
      await region.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true)
  }
  await expectInside(page.getByTestId('agent-mode-control'), panel)
  await expectInside(page.getByRole('button', { name: '本设备会话' }), panel)
  await expectInside(page.getByPlaceholder('输入问题；Enter 发送，Shift+Enter 换行'), panel)
  await expectInside(page.getByRole('button', { name: '发送' }), panel)

  const user = page.locator('.agent-message.user')
  const userBodyBox = await boundingBox(user.locator('.message-body'))
  const userAvatarBox = await boundingBox(user.locator('.message-avatar'))
  expect(userAvatarBox.x).toBeGreaterThan(userBodyBox.x + userBodyBox.width)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true)
})

