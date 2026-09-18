import { expect, test, type Page } from '@playwright/test'

/**
 * 架次查询页的架次增删（仅本地单机）。
 *
 * 架次管理从「数据管理」页移到这里：架次列表是本页主体，边看边改更顺手；
 * 「数据管理」只留 CSV 表相关的事。三方架次由平台下发、没有本地主键，
 * 故三方单机整台不出现这两个入口。接口全部打桩，不依赖后端。
 */

const LOCAL_AIRCRAFT = {
  aircraftNumber: 'B-1234',
  modelCode: 'A320',
  airline: 'CA',
  status: '在役',
  createdAt: '2026-01-01 00:00:00',
}

const EXTERNAL_AIRCRAFT = {
  aircraftNumber: 'B-001',
  modelCode: 'JX-20A',
  airline: '-',
  status: '-',
  createdAt: '-',
}

const LOCAL_SORTIE = {
  sortieId: 1,
  aircraftNumber: 'B-1234',
  sortieNumber: 'CA1201',
  flightDate: '2026-06-01',
  startTime: '08:00:00',
  endTime: '10:00:00',
  sortieKey: '1',
}

/** 三方架次：没有本地主键、时间是占位符 */
const EXTERNAL_SORTIE = {
  sortieId: null,
  aircraftNumber: 'B-001',
  sortieNumber: '20260723-1',
  flightDate: '-',
  startTime: '-',
  endTime: '-',
  sortieKey: '08b29a13-6108-58c6-a674-f7a325973ac7',
}

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

async function stub(page: Page, sortie: unknown) {
  await page.route((url) => url.pathname.startsWith('/api/'), (r) => r.fulfill(json([])))
  await page.route('**/api/aircraft/plane**', (r) =>
    r.fulfill(json([LOCAL_AIRCRAFT, EXTERNAL_AIRCRAFT])),
  )
  await page.route('**/api/tasks/aircraft/**', (r) =>
    r.fulfill(json({ tasks: [], initialization_required: false })),
  )
  await page.route('**/api/aircraft/sorties**', (r) => {
    if (r.request().method() !== 'GET') return r.fallback()
    return r.fulfill(json([sortie]))
  })
}

/** 进入工作台并切到架次查询 */
async function gotoSorties(page: Page, aircraft: string) {
  await page.goto(`aircraft/${aircraft}`)
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('架次查询')).toBeVisible({ timeout: 15_000 })
  await side.getByText('架次查询').click()
  return side
}

test('本地单机：架次查询页可添加架次，请求体带机号', async ({ page }) => {
  const bodies: string[] = []
  await stub(page, LOCAL_SORTIE)
  await page.route('**/api/aircraft/sorties', (r) => {
    bodies.push(r.request().postData() ?? '')
    return r.fulfill(json({ code: 200, message: '添加成功' }))
  })

  const side = await gotoSorties(page, 'B-1234')
  await expect(side.locator('.ws-menu-item.active')).toContainText('架次查询')
  await expect(page.locator('.el-table__body tr.el-table__row')).toHaveCount(1)

  await page.getByRole('button', { name: '添加架次' }).click()
  const dialog = page.locator('.el-dialog').filter({ hasText: '添加架次' })
  await expect(dialog).toBeVisible()
  await dialog.getByPlaceholder('如 CA1234-20260723').fill('CA1202')
  await dialog.getByRole('button', { name: '添加', exact: true }).click()

  await expect.poll(() => bodies.length, { timeout: 10_000 }).toBe(1)
  expect(JSON.parse(bodies[0])).toEqual({
    sortieNumber: 'CA1202',
    flightDate: '',
    startTime: '',
    endTime: '',
    // 新架次落在当前工作台的飞行器上，不是机号框里手填的机号
    aircraftNumber: 'B-1234',
  })
})

test('本地单机：架次查询页可删除架次', async ({ page }) => {
  const deletes: string[] = []
  await stub(page, LOCAL_SORTIE)
  await page.route('**/api/aircraft/sorties/*', (r) => {
    deletes.push(r.request().url())
    return r.fulfill(json({ code: 200, message: '删除成功' }))
  })

  await gotoSorties(page, 'B-1234')
  const row = page.locator('.el-table__body tr.el-table__row').first()
  await expect(row).toContainText('CA1201')

  await row.getByRole('button', { name: '删除架次' }).click()
  const confirm = page.locator('.el-message-box')
  await expect(confirm).toContainText('CA1201')
  await confirm.getByRole('button', { name: '删除' }).click()

  await expect.poll(() => deletes.length, { timeout: 10_000 }).toBe(1)
  expect(new URL(deletes[0]).pathname).toContain('/api/aircraft/sorties/1')
})

test('三方单机：架次查询页不提供添加 / 删除架次', async ({ page }) => {
  await stub(page, EXTERNAL_SORTIE)

  await gotoSorties(page, 'B-001')
  const row = page.locator('.el-table__body tr.el-table__row').first()
  await expect(row).toContainText('20260723-1')

  await expect(page.getByRole('button', { name: '添加架次' })).toHaveCount(0)
  await expect(row.getByRole('button', { name: '删除架次' })).toHaveCount(0)
})
