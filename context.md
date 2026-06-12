# PHM 项目前后端对接 — 上下文概要

## 服务架构

| 服务 | 地址 | 用途 |
|------|------|------|
| 本地任务后端 | `127.0.0.1:8000` | 任务 CRUD（SQLite），路由前缀 `/api` |
| 算法实例服务器 | `192.168.31.13:8001` | 启动/管理算法实例，路由前缀 `/api/pmgr` |
| OpenCode | `127.0.0.1:4096` | LLM 会话管理，每个请求需 `x-opencode-directory` |

## Vite 代理 (`vite.config.ts`)

```
/api   → http://192.168.31.13:8001        (无 rewrite)
/task  → http://127.0.0.1:8000, rewrite /task → /api
```

务必用 trailing slash 匹配后端路由：`/task/tasks/`（后端 `/api/tasks/` 不加 `/` 会 301 重定向导致 CORS）。

## 关键文件

| 文件 | 职责 |
|------|------|
| `src/api/task.ts` | 任务 CRUD，baseURL `/task` |
| `src/api/instance.ts` | 算法实例启动，baseURL `/api`，60s 超时 |
| `src/lib/opencode-api.ts` | OpenCode HTTP + SSE 客户端，导出 `ConnOpts` |
| `src/stores/task.ts` | 任务列表 + currentTask 追踪 + cookie 同步（workDir 存储在 Task 实体的 work_dir 字段上） |
| `src/stores/chat.ts` | OpenCode 连接/消息/SSE，`opts` 为动态 `Ref<ConnOpts>` |
| `src/views/AircraftWorkspace.vue` | 三 tab：任务管理 / 数据管理 / 对话入口 |

## 任务创建流程（`taskStore.createTask`）

```
instanceApi.start() → { instance_id, file_path }
  → convertPath(file_path): /mnt/d/... → \\192.168.31.13\...
  → opencodeApi.create({ dir: workDir }, name) → { id: session_id }
  → taskApi.create({ name, description, session_id, instance_id, work_dir: workDir })
  → fetchTasks() 刷新列表（workDir 随 Task 实体保存在后端）
```

## currentTask & workDir 持久化

- `currentTaskByAircraft: Record<string, number>` — 飞行器 → 任务 ID
- **workDir 存储**：workDir 存储在 Task 实体的 `work_dir` 字段上，由后端持久化。前端通过 `fetchTasks()` 获取后在 `Task.workDir` 中使用。
- **Cookie 存储**：仅 `phm_current_task` session cookie，存储 `Record<string, number>`（飞行器编号 → 任务 ID）。刷新不丢，关浏览器清除。
- **写入时机**：`setCurrentTask`、`clearCurrentTask`（cookie 同步在函数内自动完成）
- **恢复时机**：`init()` 时 `loadFromCookies()` 恢复 cookie → `fetchTasks()` 获取完整 Task 列表（含 workDir）

## OpenCode 关键约束

- **每个请求都强制带 `x-opencode-directory` header**，仅 session_id 不够
- session 在 server 端持久存在，但前端"能用"的前提是持有 workDir
- 存 workDir 由后端 Task 实体持久化，前端通过 fetchTasks() 获取，无需自行存储
- chat store 的 `opts` 是 `Ref<ConnOpts>`，`connectToSession(sid, workDir)` 会更新 `opts.value.dir`

## AircraftWorkspace 导航逻辑

```
默认 tab = 'task'（安全默认值）。加载完成后若 getCurrentTask(aircraftNumber) 存在且 task.workDir 有效，则自动切换到 'chat'

点击"编辑" → setCurrentTask → connectToSession → activeMenu='chat'
进入路由后 watch(taskStore.loading) → 加载完若 currentTask 有效 → 自动进入 chat
切换飞行器 → watch(aircraftNumber) → dispose + 重新判断默认 tab
删除任务 → 清理 currentTaskByAircraft，同步 cookie
```

## 对话入口 UI

- **有 currentTask**：顶部栏（连接状态+模型选择+中止/刷新）+ MessageFeed + 输入区
- **无 currentTask**：空状态提示 + 跳转按钮，区分"无任务"和"有任务未选择"

## 类型对照

```typescript
// 后端 DTO（snake_case）
TaskResponse:  { task_id, name, description, session_id, instance_id?, work_dir }
TaskCreate:    { name, description?, session_id, instance_id, work_dir? }
InstanceResponse: { instance_id, file_path, entrance, base_url, ... }

// 前端实体（camelCase）
Task: { id, name, description, sessionId, instanceId?, workDir, createdAt, updatedAt }
```
