完成。改动在 src/stores/chat.ts 中，以下是变更要点：

改动说明
新增变量（第 75-78 行）：

sseRetryCount — 重试计数器，用于指数退避计算
sseRetryTimer — 重试定时器句柄
SSE_RETRY_BASE_MS = 3000 / SSE_RETRY_MAX_MS = 30000 — 退避参数
新增 scheduleReconnect() 函数（第 384-393 行）：

防重入：已有定时器排队时直接返回
指数退避：delay = min(3s × 2^retryCount, 30s)
序列：3s → 6s → 12s → 24s → 30s（封顶）
修改 startEventSource()（第 395-457 行）：

新增 onopen 回调 → 连接成功后重置 sseRetryCount = 0
onerror → 关闭旧连接后调用 scheduleReconnect()（不再直接停止）
catch 块 → 创建失败时也走 scheduleReconnect()
修改 stopEventSource()（第 459-469 行）：

清理重试定时器（用户主动断开/切换 session 时取消排队中的重连）
重置重试计数器
行为变化
场景	之前	现在
SSE 连接断开	直接停止，不再恢复	指数退避自动重连（3s→6s→...→30s）
连接成功恢复	-	重试计数器归零
用户切换 session	dispose() → stopEventSource()	同样清除定时器，不会泄露重连
创建 EventSource 抛异常	静默失败	也走退避重连
