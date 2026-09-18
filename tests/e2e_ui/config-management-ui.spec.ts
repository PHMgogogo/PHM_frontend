import { expect, test, type Page } from '@playwright/test'

/**
 * 构型管理的「本机 / 第三方平台」两个来源必须共用同一套展示：
 * 同一个机型选择器、同一个白卡、同一棵 el-tree（章节号 / 名称 / 类型标签 / 件号），
 * 同一个「树形 ⇄ 构型图谱」切换；三方只读，故没有增删入口。
 *
 * 全部接口打桩：本机走 /aircraft/config-items?modelCode=...，三方走不带参的
 * /aircraft/config-items（后端回的是扁平部件行，itemId / gjbChapter 为 null）。
 */

/** 实测形态：三方行没有本地主键、也没有 GJB 章节号，名称落在 equipmentName */
function thirdRow(equipmentName: string, partNumber: string | null = null) {
  return {
    itemId: null,
    modelCode: '0001',
    parentItemId: null,
    gjbChapter: null,
    systemName: null,
    subSystemName: null,
    equipmentName,
    partNumber,
    itemType: 'EQUIPMENT',
  }
}

const THIRD_ROWS = [thirdRow('液压泵', 'PN-7200-01'), thirdRow('燃油泵')]

const LOCAL_TREE = [
  {
    itemId: 1,
    modelCode: 'B737-800',
    parentItemId: null,
    gjbChapter: '29-10',
    systemName: '液压系统',
    subSystemName: null,
    equipmentName: null,
    partNumber: null,
    itemType: 'SYSTEM',
    children: [
      {
        itemId: 2,
        modelCode: 'B737-800',
        parentItemId: 1,
        gjbChapter: '29-11',
        systemName: null,
        subSystemName: null,
        equipmentName: '液压泵',
        partNumber: 'PN-7200-01',
        itemType: 'EQUIPMENT',
      },
    ],
  },
]

async function prepareConfigPage(page: Page): Promise<void> {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
  await page.route(
    (url) => url.pathname === '/api/aircraft/models',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ modelCode: 'B737-800', manufacturer: '波音', description: '' }]),
      })
    },
  )
  await page.route(
    (url) => url.pathname === '/api/aircraft/config-items',
    async (route) => {
      // 本机机型带 modelCode；三方查询把 modelCode 传成架号，两者返回的行形态不同
      const modelCode = new URL(route.request().url()).searchParams.get('modelCode')
      const body = modelCode === 'B737-800' ? LOCAL_TREE : THIRD_ROWS
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    },
  )
  await page.route(
    (url) => url.pathname === '/api/aircraft/config-items/tree',
    async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LOCAL_TREE) })
    },
  )

  await page.goto('./')
  await page.getByText('构型管理', { exact: true }).click()
  await expect(page.locator('.tree-container')).toBeVisible()
}

/** 展开下拉并点选某一项（本地机型 / 三方架号走同一个 el-select） */
async function pick(page: Page, label: string): Promise<void> {
  await page.locator('.aircraft-selector .el-select').click()
  await page.locator('.el-select-dropdown__item', { hasText: label }).first().click()
}

test('本机机型：树形视图展示章节号 / 名称 / 类型 / 件号，并带增删入口', async ({ page }) => {
  await prepareConfigPage(page)

  const rows = page.locator('.tree-node-content')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('29-10')
  await expect(rows.first()).toContainText('液压系统')
  await expect(rows.first()).toContainText('系统')
  await expect(rows.nth(1)).toContainText('液压泵')
  await expect(rows.nth(1)).toContainText('PN-7200-01')
  await expect(page.locator('.tree-actions')).toHaveCount(2)
  await expect(page.getByRole('button', { name: '+ 添加项目' })).toBeVisible()

  // 正对照：同一张图谱在本地机型下仍保留增删入口
  await page.locator('.el-radio-button__inner', { hasText: '构型图谱' }).click()
  await expect(page.locator('.force-svg')).toBeVisible()
  // 力导向图节点一直在动，稳定性判定过不去，故跳过可操作性检查直接点
  await page.locator('.node-group').last().click({ force: true })
  await expect(page.locator('.node-toolbar')).toBeVisible()
})

test('第三方架号：与本地共用同一套树 UI，但只读', async ({ page }) => {
  await prepareConfigPage(page)

  await pick(page, '0001')

  await expect(page.locator('.current-model')).toContainText('当前构型：0001')

  // 同一套节点行（名称 / 类型 / 件号），章节号缺失时用占位符对齐
  const rows = page.locator('.tree-node-content')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('液压泵')
  await expect(rows.first()).toContainText('设备')
  await expect(rows.first()).toContainText('PN-7200-01')
  await expect(rows.nth(1)).toContainText('燃油泵')

  // 只读：无增删入口，但「树形 / 构型图谱」两个视图都还在
  await expect(page.locator('.tree-actions')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '+ 添加项目' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '删除当前构型' })).toHaveCount(0)
  await expect(page.locator('.el-radio-button__inner', { hasText: '构型图谱' })).toBeVisible()
})

test('第三方架号：可切到构型图谱，且图上不出现增删按钮', async ({ page }) => {
  await prepareConfigPage(page)

  await pick(page, '0001')
  await page.locator('.el-radio-button__inner', { hasText: '构型图谱' }).click()

  await expect(page.locator('.force-svg')).toBeVisible()
  await page.locator('.node-group').last().click({ force: true })
  await expect(page.locator('.node-toolbar')).toHaveCount(0)
})
