import { expect, test, type Page } from '@playwright/test'

/**
 * 架次查询 → 时序数据查询的下钻（两个同级工作台页面）。
 *
 * 全部接口打桩，不依赖后端真实数据：本用例验的是前端接线
 * （点行是否切页、两条分支的请求体形态、起止时间是否默认带出、返回是否回到列表）。
 * 接口契约另有 curl 实测记录，纯逻辑有 tests/unit/sortie-timeseries.test.ts。
 *
 * 分支由**单机来源**决定（GET /aircraft/plane 对三方单机下发占位符 `-`），
 * 与用户点的那一行无关，故本地/三方各用一个单机：
 * - B-001（标记字段为 `-`）→ 三方分支，走机号 / 架次号 / 起止时间；
 * - B-1234（标记字段是真实值）→ 本地分支，走 sortieId。
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

/** 实测：GET /aircraft/sorties?aircraftNumber=B-001（三方，时间是真实值） */
const EXTERNAL_SORTIE = {
  sortieId: 10001,
  aircraftNumber: 'B-001',
  sortieNumber: '20260723-1',
  flightDate: '2026-07-23',
  startTime: '10:30:00',
  endTime: '14:20:00',
}

/** 实测：GET /aircraft/sorties?aircraftNumber=B-1234（本地） */
const LOCAL_SORTIE = {
  sortieId: 1,
  aircraftNumber: 'B-1234',
  sortieNumber: 'dsafasfa',
  flightDate: '2026-07-23',
  startTime: '10:30:00',
  endTime: '14:20:00',
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

test('三方单机：点架次进时序页，默认带出架次记录的起止时间且绝不带 sortieId', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const tsBodies: string[] = []
  const calls: string[] = []
  await stub(page, tsBodies, calls)

  const side = await gotoSorties(page, 'B-001')

  // 时序数据查询与架次查询同级，且在没选过架次时给引导而非空白
  await side.getByText('时序数据查询').click()
  const main = page.locator('main')
  await expect(main).toContainText('请先在「架次查询」中选择一个架次')

  await side.getByText('架次查询').click()
  const rows = page.locator('.el-table__body tr.el-table__row')
  // 机号框预填当前飞行器 → 首屏只列本机的架次，不会混进别的机号
  await expect(rows).toHaveCount(1)
  await expect(main.locator('.w-num input').first()).toHaveValue('B-001')
  // 外源单机默认停在「数据管理」，那个面板自己会读 mappings；从点击行开始只算时序页的请求
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

  // 进页面自动查一次：机号 + 架次号 + 起止时间，属性留空（三方接口不给参数名），
  // 且**绝不带 sortieId**——实测带 sortieId 查该航新架次得 0 行
  await expect.poll(() => tsBodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(JSON.parse(tsBodies[0])).toEqual({
    aircraftNumber: 'B-001',
    sortieNumber: '20260723-1',
    startTime: '2026-07-23 10:30:00',
    endTime: '2026-07-23 14:20:00',
  })

  // 手填参数名（三方没有候选可选）后重查，名称进入 paralist
  const props = main.locator('.w-props')
  await props.click()
  const propsInput = props.locator('input')
  await propsInput.pressSequentially('ALTITUDE')
  await propsInput.press('Enter')
  await expect(props.locator('.el-tag')).toHaveText(['ALTITUDE'])
  // 手填后下拉仍开着（便于连续录入），先关掉再点查询，否则会挡住按钮
  await propsInput.press('Escape')
  await main.getByText('查询', { exact: true }).click()
  await expect.poll(() => tsBodies.length).toBeGreaterThan(1)
  expect(JSON.parse(tsBodies[tsBodies.length - 1])).toEqual({
    aircraftNumber: 'B-001',
    sortieNumber: '20260723-1',
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

test('本地单机：点架次进时序页，按 sortieId 查且属性取本地表的列名', async ({ page }) => {
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
  // 属性由 /csv/overview 的 columnTypes 推导并预选
  await expect.poll(() => tsBodies.length, { timeout: 10_000 }).toBeGreaterThan(0)
  expect(JSON.parse(tsBodies[0])).toEqual({ sortieId: 1, paralist: ['ALTITUDE', 'SPEED'] })
  await expect(main.locator('.w-time input').nth(0)).toHaveValue('')

  expect(errors).toEqual([])
})
