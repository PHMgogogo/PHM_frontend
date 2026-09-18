import { expect, test, type Page } from '@playwright/test'

/**
 * 三方（航新/633）单机的工作区必须与本地单机同构：
 * - 菜单不裁剪「当前对话」「会话管理」（会话是本地产物，与单机来自哪个平台无关），
 *   但**不提供「数据管理」**：三方架次来自三方平台，不存在本地 config_data_mapping；
 * - 进入后与本地一样按会话列表决定停在对话还是会话管理，而不是默认甩到「数据管理」；
 * - 只读范围收窄到「构型 + CSV 数据」；
 * - 训练 / 推理入口挂在「时序数据查询」页，本地与三方共用同一套入口 / 弹窗 / 请求体
 *   （取数条件都是该页的架次 sortieKey + 属性 + 起止时间，由后端按 sortieKey 定向数据源）；
 *   「数据管理」只做 CSV 上传，不再有按 CSV 表训练的第二条链路。
 *
 * 接口全部打桩，不依赖后端。
 */

/** 实测形态：三方单机的 airline/status/createdAt 是占位符 '-'（前端据此判来源，待后端下发 source） */
const EXTERNAL_AIRCRAFT = {
  aircraftNumber: 'B-001',
  modelCode: 'JX-20A',
  airline: '-',
  status: '-',
  createdAt: '-',
}

/** 实测：三方架次没有本地主键，时间字段为占位符，唯一标识是平台侧 sortieKey */
const EXTERNAL_SORTIE = {
  sortieId: null,
  aircraftNumber: 'B-001',
  sortieNumber: '20260723-1',
  flightDate: '-',
  startTime: '-',
  endTime: '-',
  sortieKey: '08b29a13-6108-58c6-a674-f7a325973ac7',
  parameterGroupId: 'pg-1',
}

const TIMESERIES_RESPONSE = {
  code: 200,
  message: 'success',
  data: {
    timestamps: [1_754_352_000_000, 1_754_352_001_000],
    parameters: [
      { name: 'ALTITUDE', values: ['1000', '1500'] },
      { name: 'N1', values: ['20.5', '21'] },
    ],
  },
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

/** 通用打桩：三方单机 + 空会话；列名走参数组 */
async function stubExternal(page: Page, calls: string[]) {
  await page.route((url) => url.pathname.startsWith('/api/'), (r) => r.fulfill(json([])))
  await page.route('**/api/aircraft/plane**', (r) => r.fulfill(json([EXTERNAL_AIRCRAFT])))
  // 三方单机没有本地会话：工作区应停在「会话管理」而不是报错
  await page.route('**/api/tasks/aircraft/**', (r) =>
    r.fulfill(json({ tasks: [], initialization_required: true })),
  )
  await page.route('**/api/aircraft/sorties**', (r) => r.fulfill(json([EXTERNAL_SORTIE])))
  await page.route('**/api/aircraft/sortie/parameters**', (r) => r.fulfill(json(['ALTITUDE', 'N1'])))
  await page.route('**/api/csv/query-timeseries', (r) => r.fulfill(json(TIMESERIES_RESPONSE)))
  await page.route('**/api/tasks/train-timeseries', (r) => {
    calls.push(r.request().postData() ?? '')
    return r.fulfill(json({ success: true }))
  })
}

/** 进入三方单机工作台 */
async function gotoWorkspace(page: Page) {
  await page.goto('aircraft/B-001')
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('当前对话')).toBeVisible({ timeout: 15_000 })
  return side
}

/**
 * 在时序页选属性。三方参数组可下发上万条，界面用「按钮 + 右侧抽屉」承载
 * （搜索 + 虚拟列表 + 已选区），故这里不能像以前那样直接点筛选栏的下拉。
 */
async function pickProperties(page: Page, names: string[]) {
  await page.locator('main').getByRole('button', { name: /选择属性/ }).click()
  const search = page.locator('.prop-search input')
  await expect(search).toBeVisible()
  for (const name of names) {
    await search.fill(name)
    const row = page.locator('.prop-row', { hasText: name })
    // 候选里没有该名字时回车直接添加（参数组不保证覆盖平台全部字段）；
    // 已在默认选中里的名字点一次会取消勾选，故只点未选中的行
    if (await row.count()) {
      const first = row.first()
      if (!(await first.getAttribute('class'))?.includes('checked')) await first.click()
    } else {
      await search.press('Enter')
    }
  }
  await expect(page.locator('.prop-selected-tags .el-tag')).toHaveCount(names.length)
  await page.locator('.el-drawer__footer').getByRole('button', { name: '完成' }).click()
  await expect(search).toBeHidden()
}

test('三方单机：菜单与本地同构，默认按会话情况落在会话管理 / 当前对话', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await stubExternal(page, [])

  const side = await gotoWorkspace(page)

  // 会话 / 对话两个菜单不裁剪
  await expect(side.getByText('会话管理')).toBeVisible()
  await expect(side.getByText('当前对话')).toBeVisible()
  // 数据管理是本地 CSV 链路（架次 → config_data_mapping → csv_<表名>），三方单机没有本地映射，故不提供入口
  await expect(side.getByText('数据管理')).toHaveCount(0)
  await expect(side.getByText('架次查询')).toBeVisible()

  // 无会话时停在会话管理（本地同样如此），而不是被甩到数据管理
  await expect(side.locator('.ws-menu-item.active')).toContainText('会话管理')

  const main = page.locator('main')

  // 切到当前对话：给出"暂无会话"的可操作提示
  await side.getByText('当前对话').click()
  await expect(side.locator('.ws-menu-item.active')).toContainText('当前对话')
  await expect(main).toContainText('暂无会话')

  expect(errors).toEqual([])
})

test('三方单机：全程不调用本地 CSV 上传与映射查询接口', async ({ page }) => {
  const uploadCalls: string[] = []
  const mappingCalls: string[] = []
  await stubExternal(page, [])
  // 记下本地 CSV 链路的两类请求；三方单机不应该发出任何一个
  await page.route('**/api/csv/upload**', (r) => {
    uploadCalls.push(r.request().url())
    return r.fulfill(json({ code: 200, message: 'ok' }))
  })
  await page.route('**/api/aircraft/mappings**', (r) => {
    mappingCalls.push(r.request().url())
    return r.fulfill(json([]))
  })

  const side = await gotoWorkspace(page)
  // 本地 CSV 链路的唯一入口「数据管理」不存在
  await expect(side.getByText('数据管理')).toHaveCount(0)

  // 逛一圈三方单机实际可用的页面：架次查询 → 时序数据查询
  await side.getByText('架次查询').click()
  await page.locator('.el-table__body tr.el-table__row').first().click()
  await expect(side.locator('.ws-menu-item.active')).toContainText('时序数据查询')
  await expect(page.locator('main')).toContainText('第三方服务')

  expect(uploadCalls).toEqual([])
  expect(mappingCalls).toEqual([])
})

test('三方单机：时序数据查询可直接发起训练，无会话时引导去会话管理', async ({ page }) => {
  const calls: string[] = []
  await stubExternal(page, calls)

  const side = await gotoWorkspace(page)
  const main = page.locator('main')

  // 架次查询 → 点行进入时序页
  await side.getByText('架次查询').click()
  await page.locator('.el-table__body tr.el-table__row').first().click()
  await expect(side.locator('.ws-menu-item.active')).toContainText('时序数据查询')

  // 三方训练入口只在时序页出现；本地单机没有这个入口（另有用例覆盖）
  const trainBtn = main.getByRole('button', { name: '去训练' })
  await expect(trainBtn).toBeVisible({ timeout: 10_000 })
  await expect(main.getByRole('button', { name: '去推理' })).toBeVisible()

  // 面板默认选中候选项的第一条，训练 / 推理直接按它取数
  await pickProperties(page, ['ALTITUDE'])
  await trainBtn.click()

  const dialog = page.locator('.el-dialog').filter({ hasText: '基于时序数据的训练配置' })
  await expect(dialog).toBeVisible()
  // 数据来源是该时序页的查询条件，不是本地 CSV 表
  await expect(dialog).toContainText('数据源：时序数据查询')
  await expect(dialog).toContainText('机号 B-001')
  await expect(dialog).toContainText('架次 20260723-1')

  // 列选项取自当前查询的属性：面板默认只选了一条属性，故它预填进数据列，标签列留给用户挑
  const selects = dialog.locator('.el-select')
  await expect(selects.nth(1)).toContainText('ALTITUDE')
  await expect(selects.nth(2)).toContainText('选择标签列')

  // 没有会话时不能提交，并给出前往会话管理的入口
  await expect(dialog).toContainText('暂无可用会话')
  await expect(dialog.getByRole('button', { name: '开始训练' })).toBeDisabled()
  dialog.getByText('前往会话管理').click()
  await expect(side.locator('.ws-menu-item.active')).toContainText('会话管理')

  // 没有可用会话，自然也没有发出训练请求
  expect(calls).toEqual([])
})

test('三方单机：有会话时可按所选属性提交训练，请求体带 sortieKey 与列名', async ({ page }) => {
  const calls: string[] = []
  await page.route((url) => url.pathname.startsWith('/api/'), (r) => r.fulfill(json([])))
  await page.route('**/api/aircraft/plane**', (r) => r.fulfill(json([EXTERNAL_AIRCRAFT])))
  await page.route('**/api/tasks/aircraft/**', (r) =>
    r.fulfill(
      json({
        tasks: [
          {
            task_id: 7,
            name: '默认会话',
            description: '',
            session_id: 'ses-1',
            instance_id: 'inst-1',
            aircraft_id: 'B-001',
            model_code: 'JX-20A',
            work_dir: '/tmp/wd',
            is_global: false,
          },
        ],
        initialization_required: false,
      }),
    ),
  )
  await page.route('**/api/aircraft/sorties**', (r) => r.fulfill(json([EXTERNAL_SORTIE])))
  await page.route('**/api/aircraft/sortie/parameters**', (r) => r.fulfill(json(['ALTITUDE', 'N1'])))
  await page.route('**/api/csv/query-timeseries', (r) => r.fulfill(json(TIMESERIES_RESPONSE)))
  await page.route('**/api/tasks/train-timeseries', (r) => {
    calls.push(r.request().postData() ?? '')
    return r.fulfill(json({ success: true }))
  })
  // 会话一旦连上，工作台会去探 OpenCode / 实例状态；这里给最小响应，避免用例依赖外部服务
  await page.route('**/opencode/**', (r) => r.fulfill(json([])))
  await page.route('**/instance/**', (r) => r.fulfill(json({ state: 'UNLOADED' })))

  // 有会话时工作台自动进「当前对话」，再切到架次查询
  const side = await gotoWorkspace(page)
  await side.getByText('架次查询').click()
  await page.locator('.el-table__body tr.el-table__row').first().click()
  const main = page.locator('main')
  await expect(main.getByRole('button', { name: '去训练' })).toBeVisible({ timeout: 10_000 })

  // 再选一列，让数据列 / 标签列各有一列（默认已选第一条，这里补上 N1）
  await pickProperties(page, ['ALTITUDE', 'N1'])

  await main.getByRole('button', { name: '去训练' }).click()
  const dialog = page.locator('.el-dialog').filter({ hasText: '基于时序数据的训练配置' })
  await expect(dialog).toBeVisible()
  // 默认选中当前对话所在的会话，数据列 / 标签列按属性预填
  await expect(dialog.locator('.el-select').first()).toContainText('默认会话')
  await expect(dialog.locator('.el-select').nth(1)).toContainText('ALTITUDE')
  await expect(dialog.locator('.el-select').nth(2)).toContainText('N1')

  await dialog.getByRole('button', { name: '开始训练' }).click()

  // 训练请求以时序查询为数据源：sortieKey 定位 + 所选属性列 + 会话实例
  await expect.poll(() => calls.length, { timeout: 10_000 }).toBe(1)
  expect(JSON.parse(calls[0])).toEqual({
    sortieId: '08b29a13-6108-58c6-a674-f7a325973ac7',
    aircraftNumber: 'B-001',
    data_cols: ['ALTITUDE'],
    label_cols: ['N1'],
    instance_id: 'inst-1',
    batch_size: 32,
    epoch: 10,
    learning_rate: 0.001,
    device: 'cpu',
    detach: true,
  })
})

test('本地单机：时序页与三方同构地提供训练 / 推理入口，数据源同样是时序查询', async ({ page }) => {
  await page.route((url) => url.pathname.startsWith('/api/'), (r) => r.fulfill(json([])))
  await page.route('**/api/aircraft/plane**', (r) =>
    r.fulfill(
      json([
        {
          aircraftNumber: 'B-1234',
          modelCode: 'B737-800',
          airline: '中国国航',
          status: 'active',
          createdAt: '2026-08-04 11:22:18.276000',
        },
      ]),
    ),
  )
  await page.route('**/api/tasks/aircraft/**', (r) =>
    r.fulfill(json({ tasks: [], initialization_required: false })),
  )
  await page.route('**/api/aircraft/sorties**', (r) =>
    r.fulfill(
      json([
        {
          sortieId: 1,
          aircraftNumber: 'B-1234',
          sortieNumber: 'dsafasfa',
          flightDate: '2026-07-23',
          startTime: '10:30:00',
          endTime: '14:20:00',
          sortieKey: '1',
        },
      ]),
    ),
  )
  await page.route('**/api/aircraft/mappings**', (r) =>
    r.fulfill(
      json([
        {
          mappingId: 6,
          aircraftNumber: 'B-1234',
          itemId: null,
          sortieId: 1,
          csvTableName: '0805',
          dataTime: '2026-08-13 17:20:13',
          createdAt: '2026-08-13 17:20:13',
        },
      ]),
    ),
  )
  await page.route('**/api/csv/overview**', (r) =>
    r.fulfill(
      json({
        tableName: 'csv_0805',
        timestampColumn: 'timestamps',
        dataColumns: ['timestamps', 'altitude'],
        textColumns: [],
        columnTypes: { timestamps: 'TIMESTAMP', ALTITUDE: 'INT64' },
      }),
    ),
  )
  await page.route('**/api/csv/query-timeseries', (r) => r.fulfill(json(TIMESERIES_RESPONSE)))

  await page.goto('aircraft/B-1234')
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('架次查询')).toBeVisible({ timeout: 15_000 })
  await side.getByText('架次查询').click()
  await page.locator('.el-table__body tr.el-table__row').first().click()
  await expect(side.locator('.ws-menu-item.active')).toContainText('时序数据查询')

  const main = page.locator('main')
  await expect(main).toContainText('本地', { timeout: 10_000 })
  // 本地与三方共用同一套入口 / 弹窗 / 请求体，取数条件就是本页的查询条件
  const trainBtn = main.getByRole('button', { name: '去训练' })
  await expect(trainBtn).toBeVisible()
  await expect(main.getByRole('button', { name: '去推理' })).toBeVisible()

  await trainBtn.click()
  const dialog = page.locator('.el-dialog').filter({ hasText: '基于时序数据的训练配置' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('数据源：时序数据查询')
  await expect(dialog).toContainText('机号 B-1234')
  await expect(dialog).toContainText('架次 dsafasfa')
  // 本地默认选中 CSV 的第一列 → 预填进数据列，标签列留给用户挑
  await expect(dialog.locator('.el-select').nth(1)).toContainText('ALTITUDE')
  // 当前没有会话，训练按钮保持禁用
  await expect(dialog).toContainText('暂无可用会话')
  await expect(dialog.getByRole('button', { name: '开始训练' })).toBeDisabled()
})
