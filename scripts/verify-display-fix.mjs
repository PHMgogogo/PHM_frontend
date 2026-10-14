// ============================================================
// 线上验证脚本：前端修复后 queryDisplay 将发出的 SQL（与
// src/api/display.ts buildDisplaySql 同一编排规则）对 4 种图表类型
// 逐一实测 data_module /csv/sql，确认全部打通。
//
// 用法：node scripts/verify-display-fix.mjs [网关地址]
// ============================================================

const GATEWAY = process.argv[2] || 'http://152.136.119.117:8888'

/** 与 src/api/display.ts buildDisplaySql 相同的编排规则 */
function buildDisplaySql({ data, columns, limit }) {
  const columnsSql = columns.map((c) => '"' + c.replace(/"/g, '""') + '"').join(', ')
  const table = data.toLowerCase().startsWith('csv_') ? data.slice(4) : data
  let sql = `SELECT ${columnsSql} FROM csv_${table}`
  if (limit > 0) sql += ` LIMIT ${limit}`
  return sql
}

const CASES = [
  { type: 'SINGLE_TIMESERIES_2D', data: '202609281120', columns: ['flight_date', 'n1_speed'], limit: 0 },
  { type: 'MULTI_TIMESERIES_2D', data: '202609281120', columns: ['flight_date', 'n1_speed', 'n2_speed', 'oil_temp'], limit: 0 },
  { type: 'MAPPING_2D', data: '202609281120', columns: ['n1_speed', 'n2_speed'], limit: 0 },
  { type: 'POINT_CLOUD_3D', data: '202609281120', columns: ['n1_speed', 'n2_speed', 'fan_vibration'], limit: 0 },
  { type: 'MAPPING_2D(limit=5)', data: 'csv_202609281120', columns: ['n1_speed', 'n2_speed'], limit: 5 },
]

let failed = 0
for (const c of CASES) {
  const sql = buildDisplaySql(c)
  const res = await fetch(`${GATEWAY}/api/csv/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  const body = await res.json().catch(() => ({}))
  const ok = res.status === 200 && body.success === true
  if (!ok) failed++
  const first = body.data?.[0]
  console.log(
    `${ok ? '✅' : '❌'} ${c.type.padEnd(22)} ${sql}` +
      (ok ? `\n   → ${body.totalRows} 行，首行：${JSON.stringify(first)}` : `\n   → ${res.status} ${JSON.stringify(body)}`),
  )
}
console.log(failed === 0 ? '\n全部通过：前端直调 /csv/sql 的 SQL 编排对线上达梦全部可用。' : `\n${failed} 个用例失败！`)
process.exit(failed === 0 ? 0 : 1)
