# PHM 开放式架构平台

基于 Vue 3 的 PHM（故障预测与健康管理）开放式架构平台前端。围绕 **机型 → 单机 → 架次 → 构型项目 → CSV 数据 → 算法实例 → 会话任务** 的领域模型，提供构型管理、飞行数据管理、算法训练 / 推理、LLM 流式对话、可配置数据看板与知识库管理等能力，并内置一套完整的军用飞机 PHM 业务演示。

> 平台前端通过 Vite 开发代理对接 **五个后端服务**（业务主后端、算法实例 Worker、任务/展示服务、OpenCode 对话服务、文档检索服务），所有业务数据均来自真实后端；仅工作区内的 6 个演示页签使用本地 Mock 数据。

---

## 技术栈

| 分类 | 技术 | 版本 | 用途 |
|---|---|---|---|
| 核心 | Vue 3 | ^3.5 | 框架（Composition API + `<script setup>`） |
| 核心 | TypeScript | ~6.0 | 类型安全 |
| 构建 | Vite | ^8.0 | 构建 / 开发服务器 |
| 构建 | unplugin-auto-import / unplugin-vue-components | ^21 / ^32 | Element Plus 按需自动导入与组件注册 |
| 路由 / 状态 | Vue Router | ^4.6 | 客户端路由 |
| 路由 / 状态 | Pinia | ^3.0 | 状态管理 |
| UI | Element Plus | ^2.14 | 组件库 |
| UI | @element-plus/icons-vue | ^2.3 | 图标 |
| 可视化 | ECharts + vue-echarts | ^6.0 / ^8.0 | 2D 图表（折线 / 柱 / 饼 / 散点） |
| 可视化 | echarts-gl | ^2.1 | 3D 点云（数据展示） |
| 可视化 | D3 | ^7.9 | 构型项目力导向图 |
| 布局 | grid-layout-plus | ^1.1 | 数据看板可拖拽栅格 |
| 文档 | @scalar/api-reference | ^1.60 | 算法实例 OpenAPI 文档渲染 |
| 渲染 | markdown-it / katex / highlight.js / DOMPurify | ^14 / ^0.17 / ^11 / ^3.4 | 对话 Markdown / 公式 / 代码高亮 / 输出净化 |

---

## 快速开始

```bash
# 按 lockfile 安装依赖
npm ci

# 启动开发服务器（默认 http://localhost:5173）
npm run dev

# 类型检查
npm run typecheck

# 类型检查 + 生产构建
npm run build:check

# 仅构建
npm run build

# 单元/契约/安全回归
npm run test:unit

# Playwright 用户流程（自动启动只读与 mutation-mock 两个隔离开发服务）
npm run test:e2e

# 预览生产构建
npm run preview
```

> ⚠️ 开发模式下，前端依赖五个后端服务（见 [后端服务与代理](#后端服务与代理)）。若对应服务未启动，相关页面会出现请求失败；工作区内的 6 个演示页签为纯前端 Mock，无需任何后端即可浏览。

---

## 整体架构

```
┌──────────────────────────────────────────────────────────────────────┐
│                            浏览器（Vue SPA）                           │
│  views / components  ──►  Pinia stores  ──►  src/api/*  ──►  fetch
└──────────────────────────────────────────────────────────────────────┘
      │          │          │            │             │
      ▼          ▼          ▼            ▼             ▼   （Vite dev proxy）
 /api 主后端  /instance 实例  /task 展示  /opencode 对话  /document 文档检索
```

- **`src/api/`**：基于 `fetch` 的可实例化 HTTP 客户端（[client.ts](src/api/client.ts) 提供 `createClient({ baseURL })` 工厂），按业务域拆分模块。
- **`src/stores/`**：Pinia store 编排跨服务流程（如「创建会话」需依次调用实例管理、OpenCode、任务后端三个服务）。
- **`src/views` + `src/components`**：页面与组件，通过路由或工作区菜单切换。

---

## 项目结构

```
src/
├── api/                       # HTTP 接口层（按域拆分，基于 client.ts）
│   ├── client.ts              #   可实例化 fetch 客户端 + ApiError + 超时
│   ├── aircraft.ts            #   机型 / 单机 / 架次 / 构型项目 / 数据映射
│   ├── csv.ts                 #   CSV 分析 / 预览 / 上传 / 删表
│   ├── task.ts                #   会话任务 CRUD / 训练 / 推理
│   ├── instance.ts            #   算法实例进程管理（pmgr）
│   ├── instance-worker.ts     #   实例内模型操作（load/train/infer/state…）
│   ├── display.ts             #   数据看板图表查询
│   ├── document.ts            #   知识库文档 + 三类低层检索
│   ├── knowledge-agent.ts     #   RAG Agent POST SSE / 历史 / 反馈
│   └── opencode.ts            #   OpenCode HTTP + SSE 封装（对话服务）
├── config/
│   ├── endpoints.ts           #   统一 API 端点前缀（API_PREFIX，与 vite proxy 对齐）
│   └── knowledge.ts           #   严格布尔、缺省关闭的 mutation UI capability
├── stores/                    # Pinia
│   ├── aircraft.ts            #   机型 / 单机列表
│   ├── configItem.ts          #   构型项目树
│   ├── dataMapping.ts         #   CSV 上传 / 分析 / 删除
│   ├── task.ts                #   会话任务全生命周期（跨服务编排）
│   ├── chat.ts                #   OpenCode 连接 / 会话 / 消息 / SSE
│   ├── knowledge.ts           #   知识库文档生命周期与轮询
│   ├── knowledge-agent.ts     #   独立 RAG Agent 会话与流状态
│   ├── demoAppStore.ts        #   演示用飞机 / 机队选择（Mock）
│   └── app.ts                 #   全局 UI 选中态
├── views/
│   ├── HomeView.vue           # 首页（4 个一级菜单）
│   ├── AircraftWorkspace.vue  # 单机工作区（9 个菜单）
│   ├── ConfigManagement.vue   # 构型管理（构型项目树 / 力导向图）
│   ├── MonitorView.vue        # 数据展示（可配置看板）
│   ├── DocumentView.vue       # 知识中心（文档 / 检索 / Agent）
│   ├── ApiDocsView.vue        # 算法实例接口文档（Scalar）
│   └── demo/                  # 6 个 PHM 演示页（纯 Mock）
├── components/
│   ├── SideNav.vue, WorkspaceSidebar.vue, AircraftCard.vue, AddAircraftDialog.vue
│   ├── ChatPanel.vue, MessageFeed.vue     # 对话
│   ├── TaskPanel.vue, TaskDialog.vue      # 会话管理
│   ├── DataPanel.vue, CsvPreview.vue      # 数据管理
│   ├── SortieDialog.vue                   # 架次
│   ├── TrainingDialog.vue, InferingDialog.vue   # 去训练 / 去推理
│   ├── ConfigForceGraph.vue               # 构型力导向图（D3）
│   ├── knowledge/                         # 知识中心文档、检索、Agent、来源与会话组件
│   ├── dashboard/                         # 数据看板（栅格 + ECharts）
│   └── demo/                              # 演示组件
├── mock/demo/                 # 演示 Mock 数据（planes/realtime/health/...）
├── types/entities.ts          # 核心实体与后端 DTO 类型
├── utils/                     # 图表配置 / 看板工具 / Markdown 渲染
└── router/index.ts            # 路由（仅 3 条）
```

---

## 路由

| 路径 | 名称 | 页面 |
|---|---|---|
| `/` | home | 首页（飞行器 / 知识库 / 构型 / 数据展示） |
| `/aircraft/:aircraftNumber` | aircraft-workspace | 单机工作区 |
| `/algo-docs/:instanceId` | algo-docs | 算法实例接口文档（新标签页打开，Scalar 渲染） |

> ⚠️ **路由路径不得以 `/api`、`/instance`、`/task`、`/opencode`、`/document` 开头**——它们是 Vite 代理前缀，会被直接转发到后端而无法命中前端路由。

---

## 功能模块

### 一、首页（`/`，[HomeView.vue](src/views/HomeView.vue)）

采用 **左侧 15% 导航栏 + 右侧内容区** 布局，深蓝工业风主题，侧栏可折叠。一级菜单 4 项：

| 菜单 | 组件 | 说明 |
|---|---|---|
| ✈️ 飞行器管理 | 内嵌卡片网格 | 单机列表，按构型筛选 + 关键字搜索，点击卡片进入工作区 |
| 📚 知识库管理 | [DocumentView](src/views/DocumentView.vue) | 文档生命周期、检索验证与知识库 Agent |
| 🔧 构型管理 | [ConfigManagement](src/views/ConfigManagement.vue) | 构型项目树管理 |
| 📡 数据展示 | [MonitorView](src/views/MonitorView.vue) | 可配置数据看板 |

#### 1.1 飞行器管理

- **按构型筛选**：选择机型（`modelCode`）后重新拉取该构型下的单机列表。
- **实时搜索**：匹配机号、构型代码、航司。
- **添加飞行器**（[AddAircraftDialog](src/components/AddAircraftDialog.vue)）：机号（必填）、构型（必填，可在弹窗内「新建构型」）、航司、构型版本、状态（活跃 / 已退役 / 维护中）。

#### 1.2 构型管理

构型（机型 `modelCode`）下维护一棵 **构型项目树**（`ConfigItem`），节点类型按 ATA/GJB 体系分四级：

```
SYSTEM ──► SUBSYSTEM ──► EQUIPMENT / LRU
```

每个节点包含：ATA 章节号（必填）、名称、件号（EQUIPMENT/LRU）。提供两种视图：

- **树形视图**（`el-tree`）：展开 / 高亮，节点上可直接「添加子项 / 删除」（按父节点类型约束可选子类型）。
- **力导向图视图**（[ConfigForceGraph](src/components/ConfigForceGraph.vue)，D3）：以机型为根，交互式增删子项。

支持新建构型项目、删除项目（级联删除子项）、删除整个构型。

#### 1.3 知识中心

知识中心将 RAG 能力组织成三个保持挂载的任务区：

- **文档库**：真实展示 `processing / indexed / failed / unknown` 生命周期、服务端文档总数、当前页分块、分页与当前页搜索。能力开启时支持 `.md / .txt / .pdf / .docx / .pptx / .html / .htm` 串行多文件上传、409 重复提示和离页任务详情对账；缺省只读，`processing/unknown` 永不可删除。
- **检索验证**：提供混合、纯向量、纯关键词三类低层检索，展示来源、正文、主分数、检索/重排分数和耗时。该区明确不调用 LLM；缺失分数显示“未提供”，服务端主 `score=0` 显示“未确认（服务返回 0）”。
- **知识库 Agent**：独立于飞机工作区 OpenCode 会话，支持 Thinking/Fast、POST SSE 阶段与 token、取消/中断重试、结构化回答、最终路由/置信度/拒答、纯文本来源和授权后的反馈。最终可信状态只采信 `done`；不会展示或持久化原始 reasoning。

“本设备会话”只在 `localStorage` 保存最多 20 个 `{id, seenAt}`，不保存问题、回答、来源或 metadata，也不调用无 owner 约束的全局 session 列表。历史接口仅恢复正文，因此旧回答不会伪造引用或反馈能力。

#### 1.4 数据展示（可配置看板）

详见 [§ 可配置数据看板](#可配置数据看板monitorview)。

---

### 二、单机工作区（`/aircraft/:aircraftNumber`，[AircraftWorkspace.vue](src/views/AircraftWorkspace.vue)）

进入后自动初始化该单机的任务上下文：拉取会话列表，若无专属会话则**静默自动创建默认会话**，随后切到「当前对话」。侧栏 9 个菜单：

| 菜单 | 组件 | 数据源 | 说明 |
|---|---|---|---|
| 🗂️ 会话管理 | [TaskPanel](src/components/TaskPanel.vue) | 真实后端 | 会话 / 实例 / 训练推理状态 |
| 📦 数据管理 | [DataPanel](src/components/DataPanel.vue) | 真实后端 | 架次 + CSV 上传 / 去训练 / 去推理 |
| 💬 当前对话 | [ChatPanel](src/components/ChatPanel.vue) | OpenCode | LLM 流式对话 |
| 📡 实时监控 | DemoRealtimeView | Mock | 关键参数看板 + 告警 |
| 🩺 增强诊断 | DemoDiagnosisView | Mock | 飞参判读 + 地面综合诊断 |
| ❤️ 健康评估 | DemoHealthView | Mock | 健康树 + 隐身评估 + 放飞支持 |
| 📈 趋势分析 | DemoTrendView | Mock | 到检信息 + 整机 / 系统趋势 |
| 🔮 故障预测 | DemoPredictionView | Mock | 寿命监控 + 故障风险预测 |
| 🔧 维修建议 | DemoMaintenanceView | Mock | 故障信息 + 排故步骤 + IETM |

> 前 3 项为真实业务，后 6 项为**纯前端 Mock 演示**（围绕 J-20 有人机 P001–P004、无人机-A P005–P006 的完整 PHM 业务闭环），不调用任何后端。

#### 2.1 会话管理（[TaskPanel](src/components/TaskPanel.vue)）

「会话（Task）」是工作区的核心编排单元，一条会话同时绑定：OpenCode 会话（`session_id`）、算法实例（`instance_id`）、工作目录（`work_dir`）与所属单机。

- 会话列表 + 关键字搜索；**默认会话**不可删除。
- **状态轮询**：每 500ms 经实例 Worker 拉取各会话状态（未加载 / 已加载 / 训练中 / 推理中），训练 / 推理时显示 **epoch + batch 双层进度条**、耗时、速率与预计剩余时间。
- 创建会话（[TaskDialog](src/components/TaskDialog.vue)）：自动完成「启动实例 → 推导工作目录 → 创建 OpenCode 会话 → 落库」五步编排，过程文案实时反馈。
- 单会话操作：**进入对话**、**推理结果**（查询并表格展示 outputs/ids）、**接口查询**（新标签页打开该实例的 Scalar 文档）、**会话删除**（级联清理 OpenCode 会话与实例）。

#### 2.2 数据管理（[DataPanel](src/components/DataPanel.vue)）

管理单机的 **架次（Sortie）** 及其关联的 **CSV 数据表**（一个架次可关联多张表）。

- **CSV 上传**：选择文件 → 填表名 → 选关联架次（必选）→ 可选关联构型项目；「分析预览」展示行数 / 有效行 / 列类型校验；上传后入库为 `csv_<表名>` 表并建立数据映射。
- **架次管理**：列表展示架次号 / 飞行日期 / 起止时间，展开行查看其下全部数据表；支持添加架次（[SortieDialog](src/components/SortieDialog.vue)）、删除架次（级联删表）、单表删表。
- **去训练 / 去推理**：每张数据表可触发 [TrainingDialog](src/components/TrainingDialog.vue) / [InferingDialog](src/components/InferingDialog.vue)，基于该表列在当前会话的实例上发起训练 / 推理，完成后跳转会话管理查看进度与结果。

#### 2.3 当前对话（[ChatPanel](src/components/ChatPanel.vue)）

详见 [§ OpenCode 对话集成](#opencode-对话集成)。

---

### 可配置数据看板（MonitorView）

首页「数据展示」的 [MonitorView](src/views/MonitorView.vue) 提供基于真实 CSV 数据的可视化看板：

- **布局**：左侧画布 + 右侧 340px 数据源配置侧栏（可收起）。画布基于 `grid-layout-plus`（12 列 × 30 行栅格），支持拖拽、缩放、**锁定 / 解锁布局**、**一键优化排版**。
- **数据源级联选择**：单机 → 架次 → 数据映射 → 列；按图表类型选择 X / Y / Z 轴（跨轴去重），设置数据点上限与窗口大小。
- **图表类型**：单参数时序 2D、多参数时序 2D、二维映射 2D、**三维点云 3D**（依赖 echarts-gl）；样式可选折线 / 散点 / 柱状 / 面积。
- **数据查询**：经 `POST /task/display/raw-data` 拉取，后端将请求组装为 SQL 转发至 CSV 模块，返回序列化图表数据，前端用 `DisplayOptionBuilder` 转 ECharts option 渲染。
- 支持图表新增 / 原位编辑（回填配置）、删除（二次确认）。

---

## 领域模型

核心实体（[types/entities.ts](src/types/entities.ts)）层级关系：

```
机型 AircraftModel (modelCode)
  └─ 单机 Aircraft (aircraftNumber, modelCode, airline, configVersion, status)
       ├─ 构型项目树 ConfigItem (SYSTEM/SUBSYSTEM/EQUIPMENT/LRU, ataChapter)
       └─ 架次 Sortie (sortieNumber, flightDate, startTime, endTime)
            └─ CSV 数据表（csv_<tableName>）── ConfigDataMapping (mappingId)
                 └─ 用于 算法实例 Instance 的 训练 / 推理
```

横切实体：

- **Instance（算法实例）**：远程算法进程，由实例管理器（`/api/pmgr`）启停；每个实例暴露独立的 Worker API（load/train/infer/state）与 OpenAPI 文档。
- **Task（会话任务）**：前端编排单元，绑定 `session_id`（OpenCode 对话上下文）+ `instance_id`（算法实例）+ `work_dir` + `aircraft_id`，并标记 `default` / `is_global`。

**业务约束**：

1. 单机必须有所属机型（构型）；构型项目按机型管理。
2. CSV 上传必须关联架次（架次归属单机），可选关联构型项目。
3. 训练 / 推理基于已上传 CSV 数据表的列进行。

---

## 后端服务与代理

开发环境通过 Vite `server.proxy` 将 5 个前缀转发到不同后端（[vite.config.ts](vite.config.ts)）；各前缀集中维护在 [src/config/endpoints.ts](src/config/endpoints.ts) 的 `API_PREFIX`，二者须保持一致：

| 前缀 | `API_PREFIX` | 转发目标 | rewrite | 用途 | 前端模块 |
|---|---|---|---|---|---|
| `/api` | `CORE` / `PMGR`(`/api/pmgr`) | `http://152.136.119.117:8080/` | 去掉 `/api` | 业务主后端（机型 / 单机 / 架次 / 构型 / CSV / 任务 / 实例管理） | aircraft / csv / task / instance |
| `/instance` | `INSTANCE` | `http://192.168.31.13:8001` | 去掉 `/instance` | 算法实例 Worker（模型 load/train/infer/state） | instance-worker |
| `/task` | `TASK` | `http://127.0.0.1:8000` | `/task` → `/api` | 任务 / 图表展示代理 | display |
| `/opencode` | `OPENCODE` | `http://192.168.31.13:8001` | 不重写 | OpenCode 对话服务（HTTP + SSE） | opencode |
| `/document` | `RAG` / `DOCUMENT`（兼容） | `${VITE_RAG_PROXY_TARGET:-http://127.0.0.1:8000}` | `/document` → `/api` | RAG（文档 / 检索 / Agent / 历史 / 反馈） | document / knowledge-agent |

接口域概览（详细字段见各 `src/api/*.ts`，算法实例动态接口见 Scalar 文档页）：

| 域 | 代表接口 |
|---|---|
| 机型 / 单机 | `GET/POST /aircraft/models`、`GET/POST /aircraft/plane`、`GET /aircraft/aircraft-numbers` |
| 架次 | `GET/POST /aircraft/sorties`、`DELETE /aircraft/sorties/{id}` |
| 构型项目 | `GET /aircraft/config-items[/tree\|/select-list]`、`POST/DELETE /aircraft/config-items` |
| 数据映射 | `GET /aircraft/mappings` |
| CSV | `POST /csv/preview`、`POST /csv/upload`、`GET /csv/overview`、`POST /csv/drop` |
| 会话任务 | `GET /tasks/aircraft/{id}`、`POST/DELETE/PUT /tasks`、`POST /tasks/train`、`POST /tasks/infer` |
| 实例管理 | `GET /highlevel`（启动）、`DELETE /highlevel/{id}`、`GET /highlevel/{id}/restart` |
| 实例 Worker | `POST /load\|/unload\|/save\|/train\|/infer`、`GET /state/{n}`、`GET /stop`、`GET /wait` |
| 数据展示 | `POST /display/raw-data` |
| 知识中心 | `POST /documents/upload`、`GET /documents[/{id}]`、`DELETE /documents/{id}`、`POST /retrieval[/dense\|/sparse]`、`POST /chat/stream`、`GET /chat/history/{id}`、`POST /feedback` |

> PHM 既有服务的真实地址仍由 `vite.config.ts` 的 proxy `target` 管理；RAG 开发地址优先用 `VITE_RAG_PROXY_TARGET` 配置，缺省为 `http://127.0.0.1:8000`。[endpoints.ts](src/config/endpoints.ts) 只负责浏览器可见的相对前缀。

### RAG capability 与生产代理

下列变量必须严格等于小写字符串 `true` 才会显示对应写入 UI；缺失、`TRUE`、`1` 或带空格的值都会关闭能力：

| 变量 | 作用 | 缺省 |
|---|---|---|
| `VITE_RAG_UPLOAD_ENABLED` | 文档上传 | `false` |
| `VITE_RAG_DELETE_ENABLED` | 文档删除请求 | `false` |
| `VITE_RAG_FEEDBACK_ENABLED` | 点赞、点踩、标记与纠正 | `false` |
| `VITE_RAG_SESSION_DELETE_ENABLED` | 远端会话删除的预留独立门禁；当前普通 UI 不提供该操作 | `false` |

这些变量只控制用户界面，**不是权限边界**。生产环境启用任何写能力前，同源网关/RAG 服务端必须按 path + method 完成身份认证、角色/owner 授权、审计、限流、上传大小以及 CSRF/SameSite 验收；不得把 `ADMIN_API_KEY`、token 或其他密钥写入 `VITE_*`、源码、URL 或浏览器存储。文档删除接口当前只证明服务接受了请求，在后端具备跨索引一致删除契约前不得开启 `VITE_RAG_DELETE_ENABLED`。

生产部署必须把浏览器 `/document/*` 转发到 RAG `/api/*`。以 Nginx 为例，SSE 路径需要关闭响应缓冲和缓存，并给生成流足够的读取时间：

```nginx
location /document/ {
    proxy_pass http://127.0.0.1:8000/api/;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
    client_max_body_size 52m;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

部署后使用无缓冲客户端验证 `session/status` 等早期事件确实先于 `done` 到达；命令中的域名和认证方式按实际网关替换：

```bash
curl -N -X POST 'https://example.internal/document/chat/stream' \
  -H 'Content-Type: application/json' \
  --data '{"message":"检查知识库连通性","stream":true,"include_sources":true,"mode":"thinking"}'
```

---

## OpenCode 对话集成

对话能力通过 [opencode.ts](src/api/opencode.ts) 对接 [OpenCode](https://opencode.ai) 服务，不走通用 `client.ts`，自行实现 HTTP + `EventSource`。

- **连接配置**（[chat.ts](src/stores/chat.ts) `DEFAULT_OPTS`）：`base: '/opencode'`、`dir`、`user: 'opencode'`、`pass: ''`。每个会话连接时用该会话的 `workDir` 覆盖 `dir`，即**每个会话连到各自工作目录**。
- **REST**：健康检查、模型列表、会话 CRUD、`POST /session/:id/prompt_async`（异步发消息，回复走 SSE）、`POST /session/:id/abort`（中止）、`POST /question/:id/reply\|/reject`（AI 提问交互）。
- **SSE 流式**（`GET /event`）：按事件类型分发——
  - `message.part.delta`：增量 token，缓冲后按 `requestAnimationFrame` 每帧合并，按消息聚合，避免逐 token 全量重渲染；
  - `message.updated` / `message.part.updated`：整条 / 单 part 补丁；
  - `session.status`：`idle` 时收尾对齐；
  - `question.asked/replied/rejected`：AI 主动提问交互。
  - 断线指数退避重连（3s 起、封顶 30s）。
- **消息渲染**：Markdown（加粗 / 斜体 / 代码 / 换行）、KaTeX 公式、highlight.js 代码高亮；区分普通文本 / 思考过程（reasoning，可折叠）/ 工具调用（tool，可折叠）。支持 `Ctrl+Enter` 快捷发送、中止生成、自动滚动。

---

## 状态管理

| Store | 职责 | 数据源 |
|---|---|---|
| `aircraftStore` | 机型 / 单机 / 机号列表 CRUD | 真实后端 |
| `configItemStore` | 构型项目树（扁平 / 树 / 下拉），按机型缓存 | 真实后端 |
| `dataMappingStore` | CSV 上传 / 分析 / 删表流程 | 真实后端 |
| `taskStore` | 会话任务全生命周期，跨 3 个服务编排；当前会话按单机经 cookie（`phm_current_task`）持久化 | 真实后端 |
| `chatStore` | OpenCode 连接 / 会话 / 消息 / SSE 订阅 / 增量合并 | OpenCode |
| `knowledgeStore` | 文档生命周期、分页、上传队列与条件轮询 | RAG |
| `knowledgeAgentStore` | Thinking/Fast POST SSE、最终可信状态、本设备会话与反馈 | RAG |
| `demoAppStore` | 演示飞机 / 机队选择 | 纯 Mock |
| `appStore` | 全局 UI 选中态 | 纯前端 |

---

## 构建优化

生产构建通过 `rollupOptions.output.manualChunks` 拆分 vendor 包（element-plus / element-plus-icons / echarts / d3 / vendor-utils）；知识中心由首页按需异步加载，避免 Markdown/KaTeX/Agent 代码进入默认首页业务 chunk。同时抑制 element-plus → @vueuse/core 传递依赖的 `INVALID_ANNOTATION` 警告。

---

## 开发注意事项

- **路由前缀冲突**：vue-router 路径不可使用 `/api`、`/instance`、`/task`、`/opencode`、`/document` 开头，否则被代理拦截。
- **端点配置**：所有代理前缀集中维护在 [src/config/endpoints.ts](src/config/endpoints.ts) 的 `API_PREFIX`，须与 `vite.config.ts` 的 `server.proxy` key 保持一致；RAG 开发地址通过 `VITE_RAG_PROXY_TARGET` 配置，其余既有服务按 `vite.config.ts` 的 proxy `target` 配置。
- **新增接口**：在 `src/api/` 对应域文件中添加，`baseURL` 一律取自 `API_PREFIX`（如 `API_PREFIX.CORE`）；跨实例请求用 `instance-worker.ts` 的 `instanceWorkerBase(id)` 按实例缓存客户端。
- **演示模块**：6 个演示页签与真实业务完全解耦，仅依赖 `src/mock/demo/`；新增真实功能应走 store + api，不要混入演示数据。
