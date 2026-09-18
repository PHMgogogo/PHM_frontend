import { expect, test, type Page } from '@playwright/test'

/**
 * 架次查询 → 时序数据查询的下钻（两个同级工作台页面）。
 *
 * 全部接口打桩，不依赖后端真实数据：本用例验的是前端接线
 * （点行是否切页、请求体是否回传 sortieKey、起止时间是否默认带出、返回是否回到列表）。
 * 接口契约另有 curl 实测记录，纯逻辑有 tests/unit/sortie-timeseries.test.ts。
 *
 * 判分支由**单机来源**决定（GET /aircraft/plane 对三方单机下发占位符 `-`），
 * 与用户点的那一行无关，故本地/三方各用一个单机：
 * - B-001（标记字段为 `-`）→ 三方分支，属性候选走参数组、起止时间由架次行拼出；
 * - B-1234（标记字段是真实值）→ 本地分支，属性候选走本地 CSV 表。
 * 但两条分支的**请求体形态相同**：都回传该架次的 sortieKey。
 */

/** 实测形态：三方单机的 airline/status/createdAt 是占位符 */
const EXTERNAL_AIRCRAFT = {
  aircraftNumber: 'B-001',
  modelCode: 'JX-20AS',
  airline: '-',
  status: '-',
  createdAt: '-',
}

const LOCAL_AIRCRAFT = {
  aircraftNumber: 'B-1234',
  modelCode: 'B737-800',
  airline: '中国国航',
  status: 'active',
  createdAt: '2026-08-04 11:22:18.276000',
}

/**
 * 实测：GET /aircraft/sorties?aircraftNumber=0003（三方行，时间是真实值）。
 * 三方行没有本地主键（sortieId 下发 null），唯一标识只有平台侧的 sortieKey。
 */
const EXTERNAL_SORTIE = {
  sortieId: null,
  aircraftNumber: 'B-001',
  sortieNumber: '20260723-1',
  flightDate: '2026-07-23',
  startTime: '10:30:00',
  endTime: '14:20:00',
  sortieKey: '08b29a13-6108-58c6-a674-f7a325973ac7',
}

/** 实测：GET /aircraft/sorties?aircraftNumber=B-1234（本地行，sortieKey 即主键字符串） */
const LOCAL_SORTIE = {
  sortieId: 1,
  aircraftNumber: 'B-1234',
  sortieNumber: 'dsafasfa',
  flightDate: '2026-07-23',
  startTime: '10:30:00',
  endTime: '14:20:00',
  sortieKey: '1',
}

const TIMESERIES_RESPONSE = {
  code: 200,
  message: 'success',
  data: {
    timestamps: [1_754_352_000_000, 1_754_352_001_000],
    parameters: [
      { name: 'altitude', values: ['0', '1500'] },
      { name: 'n1', values: ['20.5', '21'] },
    ],
  },
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

/** 通用打桩：按 URL 上的机号返回对应单机/架次，其余接口给最小可用响应 */
async function stub(page: Page, tsBodies: string[], calls: string[]) {
  // 工作台一次拉全量单机再按路由参数挑（GET /aircraft/plane 不带机号参数），故两条都返回
  await page.route('**/api/aircraft/plane**', (r) =>
    r.fulfill(json([LOCAL_AIRCRAFT, EXTERNAL_AIRCRAFT])),
  )
  await page.route('**/api/aircraft/sorties**', (r) => {
    const num = new URL(r.request().url()).searchParams.get('aircraftNumber')
    // 面板默认预填当前机号；手动清空机号时请求上是空串 → 实测后端返回全部架次
    if (!num) return r.fulfill(json([LOCAL_SORTIE, EXTERNAL_SORTIE]))
    return r.fulfill(json(num === 'B-1234' ? [LOCAL_SORTIE] : [EXTERNAL_SORTIE]))
  })
  // 本地单机才会走到的初始化链路：返回空任务列表且不需要初始化，避免卡在「正在加载工作区...」
  await page.route('**/api/tasks/aircraft/**', (r) =>
    r.fulfill(json({ tasks: [], initialization_required: false })),
  )
  await page.route('**/api/aircraft/config-items**', (r) => r.fulfill(json([])))
  // 本地分支第一步：表名只有 /aircraft/mappings 给得出
  await page.route('**/api/aircraft/mappings**', (r) => {
    calls.push('mappings')
    return r.fulfill(
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
    )
  })
  await page.route('**/api/csv/overview**', (r) => {
    calls.push('overview')
    return r.fulfill(
      json({
        tableName: 'csv_0805',
        deviceName: '0805',
        timestampColumn: 'timestamps',
        dataColumns: ['timestamps', 'altitude', 'speed'],
        textColumns: [],
        // 键为大写，与 dataColumns 的小写不是同一套（实测）
        columnTypes: { timestamps: 'TIMESTAMP', ALTITUDE: 'INT64', SPEED: 'INT64' },
      }),
    )
  })
  await page.route('**/api/csv/query-timeseries', (r) => {
    tsBodies.push(r.request().postData() ?? '')
    return r.fulfill(json(TIMESERIES_RESPONSE))
  })
}

/** 打开工作台并进入架次查询（两种单机都要先过掉各自的初始化） */
async function gotoSorties(page: Page, aircraft: string) {
  await page.goto(`aircraft/${aircraft}`)
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('架次查询')).toBeVisible({ timeout: 15_000 })
  await side.getByText('架次查询').click()
  return side
}

test('三方单机：点架次进时序页，默认带出架次记录的起止时间并回传 sortieKey', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tsBodies: string[] = []
  const calls: string[] = []
  await stub(page, tsBodies, calls)

  const side = await gotoSorties(page, 'B-001')

  // 不点架次直接进时序页：默认取该单机的第一条架次直接出数据，不再要求先回列表挑一次
  await side.getByText('时序数据查询').click()
  const main = page.locator('main')
  await expect(main).toContainText('架次号 20260723-1')

  await side.getByText('架次查询').click()
  const rows = page.locator('.el-table__body tr.el-table__row')
  // 机号框预填当前飞行器 → 首屏只列本机的架次，不会混进别的机号
  await expect(rows).toHaveCount(1)
  await expect(main.locator('.w-num input').first()).toHaveValue('B-001')
  // 清掉进工作台时的辅助请求，从点击行开始只算时序页的请求
  calls.length = 0
  await rows.filter({ hasText: 'B-001' }).click()

  // 切到同级页面：菜单高亮跟着走，来源按单机标记判为三方
  await expect(side.locator('.ws-menu-item.active')).toContainText('时序数据查询')
  await expect(main).toContainText('第三方服务')
  await expect(main).toContainText('机号 B-001')
  await expect(main).toContainText('架次号 20260723-1')

  // 起止时间默认取架次记录（flightDate + HH:mm:ss 拼成后端要的完整时间），仍可手改
  const timeInputs = main.locator('.w-time input')
  await expect(timeInputs).toHaveCount(2)
  await expect(timeInputs.nth(0)).toHaveValue('2026-07-23 10:30:00')
  await expect(timeInputs.nth(1)).toHaveValue('2026-07-23 14:20:00')

  // 进页面自动查一次：sortieKey 定位架次 + 机号兜底 + 起止时间，属性留空（三方接口不给参数名）
  await expect.poll(() => tsBodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(JSON.parse(tsBodies[0])).toEqual({
    sortieId: '08b29a13-6108-58c6-a674-f7a325973ac7',
    aircraftNumber: 'B-001',
    startTime: '2026-07-23 10:30:00',
    endTime: '2026-07-23 14:20:00',
  })

  // 属性候选可达万级（实测航新 12000+），故不在筛选栏摆下拉，改在右侧抽屉里选：
  // 搜索 + 命中数 + 虚拟列表；候选里没有的名字可直接回车添加（本用例该架次没有参数组）
  const propsBtn = main.getByRole('button', { name: /选择属性/ })
  await expect(propsBtn).toContainText('未选')
  await propsBtn.click()
  const propSearch = page.locator('.prop-search input')
  await expect(propSearch).toBeVisible()
  await propSearch.fill('ALTITUDE')
  await propSearch.press('Enter')
  await expect(page.locator('.prop-selected-tags .el-tag')).toHaveText(['ALTITUDE'])
  // 抽屉是浮层，不关掉会挡住「查询」按钮
  await page.locator('.el-drawer__footer').getByRole('button', { name: '完成' }).click()
  await expect(propSearch).toBeHidden()
  // 关闭后按钮上仍带着已选数量，属性名不离开抽屉
  await expect(propsBtn).toContainText('已选 1')

  await main.getByText('查询', { exact: true }).click()
  await expect.poll(() => tsBodies.length).toBeGreaterThan(1)
  expect(JSON.parse(tsBodies[tsBodies.length - 1])).toEqual({
    sortieId: '08b29a13-6108-58c6-a674-f7a325973ac7',
    aircraftNumber: 'B-001',
    startTime: '2026-07-23 10:30:00',
    endTime: '2026-07-23 14:20:00',
    paralist: ['ALTITUDE'],
  })

  // 结果表：时间列 + 每个参数一列（列名在表头行，值在数据行）
  await expect(main).toContainText('共 2 条数据')
  await expect(page.locator('.el-table__header')).toContainText('altitude')
  await expect(rows.nth(1)).toContainText('1500')

  // 三方不需要读本地 CSV 表
  expect(calls.filter((c) => c === 'mappings' || c === 'overview')).toEqual([])

  // 返回架次查询：列表还在（仍是首屏那份本机架次）
  await main.getByText('返回架次查询').click()
  await expect(main).toContainText('共 1 条架次')

  expect(errors).toEqual([])
})

test('本地单机：点架次进时序页，按 sortieKey 查且属性取本地表的列名', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tsBodies: string[] = []
  await stub(page, tsBodies, [])

  const side = await gotoSorties(page, 'B-1234')
  const main = page.locator('main')
  const rows = page.locator('.el-table__body tr.el-table__row')
  // 机号同样预填当前飞行器，首屏只有本机那一条架次
  await expect(rows).toHaveCount(1)
  await rows.filter({ hasText: 'B-1234' }).click()

  await expect(side.locator('.ws-menu-item.active')).toContainText('时序数据查询')
  await expect(main).toContainText('本地')
  await expect(main).toContainText('数据表 0805')

  // 本地行只有 HH:mm:ss、拼不出完整时间，故时间留空由后端按架次起止查；
  // 属性由 /csv/overview 的 columnTypes 推导，默认选中第一条
  await expect.poll(() => tsBodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(JSON.parse(tsBodies[0])).toEqual({
    sortieId: '1',
    aircraftNumber: 'B-1234',
    paralist: ['ALTITUDE'],
  })
  await expect(main.locator('.w-time input').nth(0)).toHaveValue('')

  expect(errors).toEqual([])
})

test('直接进时序页：默认带出该单机的第一条架次并查询', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tsBodies: string[] = []
  await stub(page, tsBodies, [])

  await page.goto('aircraft/B-1234')
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('架次查询')).toBeVisible({ timeout: 15_000 })
  // 不经过架次查询，直接点菜单进时序页
  await side.getByText('时序数据查询').click()

  const main = page.locator('main')
  await expect(main).toContainText('架次号 dsafasfa')
  await expect(main).toContainText('数据表 0805')

  await expect.poll(() => tsBodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(JSON.parse(tsBodies[0])).toEqual({
    sortieId: '1',
    aircraftNumber: 'B-1234',
    paralist: ['ALTITUDE'],
  })

  expect(errors).toEqual([])
})

test('该单机没有架次时：时序页才落到「去架次查询」引导', async ({ page }) => {
  const tsBodies: string[] = []
  await stub(page, tsBodies, [])
  // 覆盖：该单机一条架次都没有
  await page.route('**/api/aircraft/sorties**', (r) => r.fulfill(json([])))

  await page.goto('aircraft/B-1234')
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('架次查询')).toBeVisible({ timeout: 15_000 })
  await side.getByText('时序数据查询').click()

  const main = page.locator('main')
  await expect(main).toContainText('该单机暂无架次')
  await expect(main.getByRole('button', { name: '去架次查询' })).toBeVisible()
  // 没有架次就不该发时序查询
  expect(tsBodies).toEqual([])
})
