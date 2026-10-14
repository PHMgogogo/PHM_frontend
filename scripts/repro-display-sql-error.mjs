// ============================================================
// 复现脚本：/api/display/raw-data 返回
//   {"detail":"CSV service returned 400: {\"success\":false,\"error\":\"SQL执行错误\"}"}
// 的根因定位（无状态，可重复执行）。
//
// 用法：node scripts/repro-display-sql-error.mjs [网关地址]
//   网关地址缺省 http://152.136.119.117:8888（与 vite.config.ts 代理目标一致）
//
// 结论（2026-10-14 实测）：
//   ① 经 PHM_entity 的 /api/display/raw-data  → 400 SQL执行错误（问题现象）
//   ② 直调 data_module /api/csv/sql 执行【部署版 entity 拼出的 SQL】
//      SELECT N1_SPEED, N2_SPEED FROM csv_202609281120   → 400 SQL执行错误（根因）
//      部署版 display.py（git 已提交版本）对列名做 c.upper() 且不加引号，
//      达梦把未加引号的标识符折叠为大写，而建表时列名是带引号的小写形态
//      （"n1_speed"），大小写敏感匹配不上 → 列不存在。
//   ③ 直调 data_module /api/csv/sql 执行【正确 SQL】
//      SELECT "n1_speed", "n2_speed" FROM csv_202609281120 → 成功返回 15 行
//      （本地工作区未提交的 display.py 修复即此形态；前端修复同此思路）
// ============================================================

const GATEWAY = process.argv[2] || 'http://152.136.119.117:8888'

const DISPLAY_REQ = {
  data: '202609281120',
  columns: ['n1_speed', 'n2_speed'],
  limit: 0,
  type: 'MAPPING_2D',
}

// 部署版 entity（列名 upper() 不加引号）实际拼出的 SQL
const OLD_ENTITY_SQL = 'SELECT N1_SPEED, N2_SPEED FROM csv_202609281120'
// 正确形态：列名加引号保留建表时的小写，表名不加引号（建表时未加引号）
const FIXED_SQL = 'SELECT "n1_speed", "n2_speed" FROM csv_202609281120'

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text.slice(0, 300)
  }
  return { status: res.status, data }
}

function preview(data) {
  const s = JSON.stringify(data)
  return s.length > 200 ? s.slice(0, 200) + '…' : s
}

console.log(`网关：${GATEWAY}\n`)

// ① 问题现象：经 entity 展示代理
{
  const { status, data } = await postJson(`${GATEWAY}/api/display/raw-data`, DISPLAY_REQ)
  const ok = status === 200
  console.log(`① POST /api/display/raw-data           → ${status} ${ok ? '✅' : '❌'}`)
  console.log(`   ${preview(data)}\n`)
}

// ② 根因：部署版 entity 拼出的 SQL 直投 data_module
{
  const { status, data } = await postJson(`${GATEWAY}/api/csv/sql`, { sql: OLD_ENTITY_SQL })
  const ok = status === 200 && data.success === true
  console.log(`② /api/csv/sql + 部署版SQL(列名大写不加引号)  → ${status} ${ok ? '✅' : '❌'}`)
  console.log(`   SQL: ${OLD_ENTITY_SQL}`)
  console.log(`   ${preview(data)}\n`)
}

// ③ 验证修复：正确引号形态的 SQL 直投 data_module
{
  const { status, data } = await postJson(`${GATEWAY}/api/csv/sql`, { sql: FIXED_SQL })
  const ok = status === 200 && data.success === true
  console.log(`③ /api/csv/sql + 修复SQL(列名加引号保小写)    → ${status} ${ok ? '✅' : '❌'}`)
  console.log(`   SQL: ${FIXED_SQL}`)
  console.log(`   ${preview(data)}\n`)
  if (ok) console.log(`   返回 ${data.totalRows} 行，列：${JSON.stringify(data.columns)}`)
}
