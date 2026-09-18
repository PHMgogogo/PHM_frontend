import { expect, test, type Page } from '@playwright/test'

/**
 * 数据管理 → CSV 上传面板：表名默认取架次号。
 *
 * 一个架次可挂多张 CSV 表，所以「表名 = 架次号」是**默认值**而非硬绑定：
 * 同架次已有同名表时自动加序号，避免后端建表覆盖；用户也能手工改名。
 * 全部接口打桩，不依赖后端。
 */

const LOCAL_AIRCRAFT = {
  aircraftNumber: 'B-1234',
  modelCode: 'A320',
  airline: 'CA',
  status: '在役',
  createdAt: '2026-01-01 00:00:00',
}

const SORTIES = [
  {
    sortieId: 1,
    aircraftNumber: 'B-1234',
    sortieNumber: 'CA1201',
    flightDate: '2026-06-01',
    startTime: '08:00:00',
    endTime: '10:00:00',
    sortieKey: '1',
  },
  {
    sortieId: 2,
    aircraftNumber: 'B-1234',
    sortieNumber: 'CA1202',
    flightDate: '2026-06-02',
    startTime: '09:00:00',
    endTime: '11:00:00',
    sortieKey: '2',
  },
]

/** 架次 CA1201 已有一张 csv_CA1201 */
const MAPPINGS = [
  { mappingId: 1, sortieId: 1, csvTableName: 'CA1201', createdAt: '2026-06-01 10:10:00' },
]

function json(body: unknown) {
  return { status: 200, contentType: 'application/json', body: JSON.stringify(body) }
}

async function stub(page: Page, uploads: string[]) {
  await page.route((url) => url.pathname.startsWith('/api/'), (r) => r.fulfill(json([])))
  await page.route('**/api/aircraft/plane**', (r) => r.fulfill(json([LOCAL_AIRCRAFT])))
  await page.route('**/api/tasks/aircraft/**', (r) => r.fulfill(json({ tasks: [] })))
  await page.route('**/api/aircraft/sorties**', (r) => r.fulfill(json(SORTIES)))
  await page.route('**/api/aircraft/mappings**', (r) => r.fulfill(json(MAPPINGS)))
  await page.route('**/api/csv/upload**', (r) => {
    uploads.push(r.request().url())
    return r.fulfill(json({ code: 200, message: '上传成功' }))
  })
}

async function gotoDataPanel(page: Page) {
  await page.goto('aircraft/B-1234')
  const side = page.locator('.ws-sidebar')
  await expect(side.getByText('数据管理')).toBeVisible({ timeout: 15_000 })
  await side.getByText('数据管理').click()
  const panel = page.locator('.upload-section')
  await expect(panel).toBeVisible()
  return panel
}

/** 打开「关联架次」下拉并选中第 index 个选项 */
async function pickSortie(page: Page, index = 0) {
  const panel = page.locator('.upload-section')
  await panel.locator('.el-select').first().click()
  await page.locator('.el-select-dropdown__item').nth(index).click()
}

test('表名默认取架次号：已有同名表时自动加序号，切换架次后重新带出', async ({ page }) => {
  const uploads: string[] = []
  await stub(page, uploads)
  const panel = await gotoDataPanel(page)
  const name = panel.locator('input[placeholder="选择架次后自动填充"]')

  // 未选架次前表名留空，并给出下一步提示
  await expect(name).toHaveValue('')
  await expect(panel).toContainText('先选关联架次，表名会自动带出')

  // CA1201 已存在 csv_CA1201 → 默认表名避让为 CA1201_2
  await pickSortie(page, 0)
  await expect(name).toHaveValue('CA1201_2')
  // 默认表名本身就是架次号形态，未改名前不出现「恢复为架次号」
  await expect(panel.getByText('恢复为架次号')).toHaveCount(0)

  // 换成没有数据表的架次 → 直接用架次号
  await pickSortie(page, 1)
  await expect(name).toHaveValue('CA1202')
})

test('表名可手工改名，也能一键恢复为架次号', async ({ page }) => {
  const uploads: string[] = []
  await stub(page, uploads)
  const panel = await gotoDataPanel(page)
  const name = panel.locator('input[placeholder="选择架次后自动填充"]')

  await pickSortie(page, 1)
  await expect(panel.getByText('恢复为架次号')).toHaveCount(0)

  await name.fill('CA1202_左发')
  await expect(panel.getByText('恢复为架次号')).toBeVisible()

  await panel.getByText('恢复为架次号').click()
  await expect(name).toHaveValue('CA1202')
  await expect(panel.getByText('恢复为架次号')).toHaveCount(0)
})

test('本地单机混有三方架次：可绑定 CSV 的只有本地架次，三方架次不发任何本地映射请求', async ({ page }) => {
  const uploads: string[] = []
  const mappingQueries: string[] = []
  await stub(page, uploads)
  // 覆盖 stub：同一机号下混入一条三方架次（sortieId 为 null、时间是占位符）
  await page.route('**/api/aircraft/sorties**', (r) =>
    r.fulfill(
      json([
        ...SORTIES,
        {
          sortieId: null,
          aircraftNumber: 'B-1234',
          sortieNumber: 'CA1203',
          flightDate: '-',
          startTime: '-',
          endTime: '-',
          sortieKey: '08b29a13-6108-58c6-a674-f7a325973ac7',
        },
      ]),
    ),
  )
  await page.route('**/api/aircraft/mappings**', (r) => {
    mappingQueries.push(r.request().url())
    return r.fulfill(json(MAPPINGS))
  })

  const panel = await gotoDataPanel(page)

  // 本页只有上传表单：架次列表 / 数据表列表都不在这里（架次在「架次查询」页，
  // 训练推理在「时序数据查询」页），因此没选架次前不会查任何映射
  await expect(panel).not.toContainText('CSV 数据表')
  await expect(panel).not.toContainText('删除架次')
  await expect(panel).not.toContainText('关联构型')
  expect(mappingQueries).toEqual([])

  // 「关联架次」下拉只列本地架次，三方架次不参与 CSV 表绑定
  await panel.locator('.el-select').first().click()
  const options = page.locator('.el-select-dropdown__item')
  await expect(options).toHaveCount(SORTIES.length)
  await expect(page.locator('.el-select-dropdown').first()).not.toContainText('CA1203')

  // 选中本地架次后才查它自己的表名，且不可能出现 ?sortieId=null
  await options.nth(0).click()
  await expect.poll(() => mappingQueries.length).toBeGreaterThan(0)
  expect(mappingQueries.every((u) => !u.includes('sortieId=null'))).toBe(true)
  expect(mappingQueries[0]).toContain('sortieId=1')
})

test('上传请求带 tableName 与 sortieId，成功后保留架次选择', async ({ page }) => {
  const uploads: string[] = []
  await stub(page, uploads)
  const panel = await gotoDataPanel(page)
  const name = panel.locator('input[placeholder="选择架次后自动填充"]')

  await pickSortie(page, 1)
  await panel.locator('input[type="file"]').setInputFiles({
    name: 'raw.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('time,ALTITUDE\n0,1000\n'),
  })
  await panel.getByRole('button', { name: '上传', exact: true }).click()

  await expect.poll(() => uploads.length).toBe(1)
  const url = new URL(uploads[0])
  expect(url.pathname).toContain('/api/csv/upload')
  expect(url.searchParams.get('tableName')).toBe('CA1202')
  expect(url.searchParams.get('sortieId')).toBe('2')

  // 上传成功后保留架次选择，便于同架次连传多张表
  await expect(name).toHaveValue('CA1202')
  await expect(panel.locator('input[type="file"]')).toHaveValue('')
})

test('上传失败时回显后端给的原因，而不是泛化的「上传失败」', async ({ page }) => {
  const uploads: string[] = []
  await stub(page, uploads)
  // 覆盖：后端拒绝重复绑定，错误体是数据后端的 { "error": "…" } 形态（没有 message）
  await page.route('**/api/csv/upload**', (r) => {
    uploads.push(r.request().url())
    return r.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: '该架次已绑定CSV表，不能重复绑定' }),
    })
  })

  const panel = await gotoDataPanel(page)
  await pickSortie(page, 1)
  await panel.locator('input[type="file"]').setInputFiles({
    name: 'raw.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('time,ALTITUDE\n0,1000\n'),
  })
  await panel.getByRole('button', { name: '上传', exact: true }).click()

  await expect.poll(() => uploads.length).toBe(1)
  await expect(page.locator('.el-message')).toContainText('该架次已绑定CSV表，不能重复绑定')
  // 失败不重置表单：文件还在，用户改个表名 / 换个架次就能重试
  await expect(panel.locator('input[type="file"]')).not.toHaveValue('')
})
