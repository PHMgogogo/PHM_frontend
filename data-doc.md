## 15. 时序数据统一查询（按架次路由）

`POST /csv/query-timeseries` · `application/json`

按架次把查询**定向**到本地 / 航新 / 633 中的**一个**平台：后端在内存平台路由索引里查该架次归属，只向该平台发请求。本地走 `config_data_mapping` 关联的 `csv_xxx` 表；三方先查架次接口拿起止时间（转 ISO）再查时序接口。索引未命中时返回空结构并记 warn 日志，**不回落其它源**。

**请求体**（`UnifiedTimeSeriesRequest`）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sortieId` | string | 是 | 架次标识，取 `/aircraft/sorties` 下发的 `sortieKey`（接受 `sortieKey` 作为 JSON 别名） |
| `airplaneType` | string | 是 | 机型（路由唯一依据），如 `K4-WS19`；带冒号的合成机型码（`K4-WS19:6`）不会转发给三方 |
| `aircraftNumber` | string | 否 | 机号，仅当路由索引缺该架次机号时作为补充 |
| `startTime` | string | 否 | 开始时间；支持 `2026-07-23 10:30:00`（含小数秒）与 ISO 两种格式 |
| `endTime` | string | 否 | 结束时间；格式同上 |
| `paralist` | string[] | 否 | 参数列表（本地 → 列名；633 → Paralist；航新 → parameters） |
| `samplingRate` | string | 否 | 采样率，默认 `10` |

时间缺省逻辑：不传时优先用 `/aircraft/sorties` 刷新时缓存的架次起止时间，缓存缺失才回查三方架次接口；最终统一转成 `2026-07-23T10:30:00.000+08:00` 形式发给三方。

**请求示例**：

```json
{
  "airplaneType": "K4-WS19:6",
  "sortieId": "1",
  "startTime": "2026-07-23 10:30:00",
  "endTime": "2026-07-23 14:20:00",
  "paralist": ["ALTITUDE", "SPEED"],
  "samplingRate": "10"
}
```

**响应 200**（`ApiResult<UnifiedTimeSeriesResponse>`）：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "timestamps": [1783296000000, 1783296001000],
    "parameters": [
      { "name": "ALTITUDE", "values": [1000.5, 1001.2] },
      { "name": "SPEED", "values": [300.0, 301.0] }
    ]
  },
  "hangxin": null,
  "sansan": null,
  "local": null
}
```

- `timestamps`：毫秒时间戳数组（航新源已由纳秒转毫秒）
- `parameters[].values`：与时间轴一一对应
- `hangxin` / `sansan` / `local`：数据源查询元信息（`SourceInfo`），非空时才返回
- 三个源都没数据时返回空结构（`timestamps: []`, `parameters: []`）

**错误**：400 —— 缺 `sortieKey`/`sortieId` 或参数非法；500 —— 查询异常。