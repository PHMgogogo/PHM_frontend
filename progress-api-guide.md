# 训练/推理进度条前后端对接指南

## 1. 数据流总览

```
前端轮询 GET /state/{n} 
    └── ProgressResponse {
            state,            // 状态枚举
            epoch_progress,   // tqdm format_dict
            batch_progress,   // tqdm format_dict
            result            // 最近 n 条 ModelResult
        }
```

## 2. 字段详解

### 2.1 `epoch_progress` — Epoch 级进度

来源：tqdm 外层循环 `tqdm(range(epoch))` 的 `format_dict`。

| 字段 | 类型 | 说明 | 必用 |
|---|---|---|---|
| `n` | `int` | **已完成**的 epoch 数（回调时机见下方说明） | ✅ |
| `total` | `int` | 总 epoch 数 | ✅ |
| `elapsed` | `float` | 从训练开始到当前的耗时（秒） | ✅ |
| `rate` | `float \| null` | epoch 处理速率（epoch/s），初始为 null | ✅ |
| `ncols` | `int \| null` | 终端列数（Web 端可忽略） | ❌ |
| `nrows` | `int \| null` | 终端行数（Web 端可忽略） | ❌ |
| `prefix` | `str` | 进度条前缀文字 | ❌ |
| `ascii` | `bool \| str` | ASCII 模式 | ❌ |
| `unit` | `str` | 单位文字（默认 `"it"`） | ❌ |
| `unit_scale` | `bool \| int` | 单位缩放 | ❌ |
| `bar_format` | `str \| null` | 自定义格式字符串 | ❌ |
| `postfix` | `dict \| null` | 附加信息 | ❌ |
| `unit_divisor` | `int` | 单位除数 | ❌ |
| `initial` | `int` | 起始计数（默认 0） | ❌ |
| `colour` | `str \| null` | 颜色 | ❌ |

> **回调时机说明**：`epoch_callback` 在 epoch 循环体**开头**触发，因此第 1 个 epoch 开始时 `n=0`，第 1 个 epoch 结束后（即第 2 个 epoch 开始时）`n=1`。全部 epoch 结束后还会额外触发一次，此时 `n=total`。

### 2.2 `batch_progress` — Batch 级进度

来源：tqdm 内层循环 `tqdm(data_loader)` 的 `format_dict`。

字段结构与 `epoch_progress` 完全相同，区别在于语义：

| 字段 | 语义 |
|---|---|
| `n` | 当前 epoch 内**已处理**的 batch 数 |
| `total` | 当前 epoch 的总 batch 数（= 数据集样本数 ÷ batch_size 向上取整） |
| `elapsed` | 当前 epoch 开始到现在的耗时（秒） |
| `rate` | batch 处理速率（batch/s） |

> **关键特性**：每个新 epoch 开始时，内层 tqdm 会被重新创建，`batch_progress` 会**归零重置**。前端会看到 `n` 从 0 涨到 total、然后跳回 0、再涨到 total……循环直到全部 epoch 结束。

### 2.3 回调触发频率

以 `epoch=10, 数据集1000条, batch_size=32` 为例：

- `total_batches = ceil(1000/32) = 32`
- epoch_callback 触发：**11 次**（10 个 epoch 各触发一次 + 最终完成一次）
- batch_callback 触发：**320 次**（10 × 32，每个 batch 一次）

> 前端 1 秒轮询一次，每次拿到的是**该时刻最新的快照**，不会丢失进度。

## 3. 前端对接方案

### 3.1 单层进度条

利用 `epoch_progress * batch_progress` 做总进度


## 4. 与 `/state/{n}` 参数 `n` 的关系

`n` 控制返回最近几条 `ModelResult`（每条 = 一个完成的 epoch 的结果），与进度条渲染**无关**。进度条使用的 `epoch_progress` 和 `batch_progress` 始终是当前最新快照，不受 `n` 影响。

对于只做进度条展示的前端，传 `n=1` 即可，减少数据传输量。
