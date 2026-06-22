# PHM 系统开放式架构差距分析

## 一、判定基准（来自开放式架构.md 的本质）

文档的核心论点可以收敛为一句话：**架构 = 模块 + 接口；只规定"是什么"（功能/行为/接口），不规定"如何做"（实现）**。各标准落在六项可检验属性上：

| 标准 | 关键诉求 | 在本项目的对应物 |
|---|---|---|
| MOSA | 模块化松耦合、新技术热插拔、互操作 | 算法实例、Dashboard 组件 |
| OSA | 标准接口、可移植、不受供应商限制 | API 层、多后端代理 |
| OMS | 平台/载荷分离、服务总线、测试/容错/隔离/认证 | 任务编排、SSE |
| FACE | 正式数据模型、公共操作环境、可移植组件 | 训练/推理契约、数据交换 |
| SOSA | 即插即用、可升级/可扩展/弹性 | 算法目录、组件注册 |
| HOST | 接口基线标准化、可组合 | 实例 worker 接口 |

本仓库是一个 **Vue3 前端**，因此分析会区分"前端可独立落地"与"需后端协同"两类。

## 二、已具备的基础（不要推倒重来）

这几处已经踩在开放式架构的正确方向上，是后续改造的支点：

1. **领域模型已做模块化分解** — `src/types/entities.ts` 的 `ConfigItem` 按 ATA 章节组织为 `SYSTEM → SUBSYSTEM → EQUIPMENT/LRU` 四级树，正是 MOSA"系统/子系统/组件分离"的领域落地。
2. **算法实例已是热插拔单元** — `src/api/instance.ts` 的 `start/restart/remove` + `src/api/instance-worker.ts` 的 `load/train/infer/save/state` 构成了一套相对统一的"算法模块生命周期接口"。
3. **HTTP 客户端已解耦单后端** — `src/api/client.ts` 的 `createClient()` 工厂支持多 baseURL，是"不受供应商限制"的雏形。
4. **Dashboard 已是可配置组件体系** — `src/utils/dashboard-types.js` 定义了配置 Schema + `validateDashboardConfig` 校验 + 布局导入导出，具备 FACE"可移植组件单元"的形态。
5. **每个实例已自带 OpenAPI 文档** — `src/types/entities.ts` 的 `InstanceResponse` 含 `doc_url / index_url`，即每台算法实例已经暴露了自己的接口文档。**这是被严重低估的资产。**
6. **SSE 已有容错退避** — `sse设计.md` 的指数退避重连，对应 OMS 的"容错"诉求。

## 三、核心缺陷与工程方案

### 缺陷 1：算法模块契约未形式化、未版本化（违 FACE / OSA）

**现状**：算法实例的接口（`load/train/infer/save/state` 及 `TrainArgs`）仅以 TS 类型 + 注释存在于 `src/types/entities.ts`，没有版本号、没有能力声明。`TrainArgs` 还带着强烈的 PyTorch 烙印（`epoch/batch_size/learning_rate/device`），换一套算法框架（规则推理、信号处理）就套不进去。讽刺的是，实例**已经**通过 `doc_url` 暴露了 OpenAPI，前端却从不读取。

**影响**：第三方供应商无法仅凭"接口标准"实现一个可互换的算法——必须读前端源码。这违背了"只规定是什么、不规定如何做"的根本原则。

**工程方案**：
- 定义 **算法模块契约 (Algorithm Module Contract)**：一份版本化的 JSON Schema，包含 `contract_version`、`input_schema`、`output_schema`、`hyperparam_schema`、`capabilities[]`。前端在 `src/types/entities.ts` 中以这份契约为单一事实源。
- 在实例启动后调用其已有的 `doc_url`（OpenAPI）+ 新增 `GET /manifest`，**自描述**契约版本与能力；前端用 `ajv` 在调用前校验响应符合预期 schema。
- 把 `epoch/batch_size` 等"框架私有参数"下沉到 `hyperparam_schema`（由实例自描述），前端动态渲染表单，而非硬编码字段。

### 缺陷 2：缺少模块注册与发现机制（违 SOSA / MOSA）

**现状**：
- Dashboard 把组件**硬编码**为唯一一种 `ChartWidget`——`src/components/dashboard/DashboardContainer.vue`。新增仪表/表格/3D 视图必须改核心文件。
- 没有"算法目录"——所有实例都是匿名的通用 instance，用户无法从一个**注册表**里选择"振动分析算法 v2""轴承剩余寿命算法"。

**影响**：不是真正的即插即用（plug-and-play），新增能力=改代码+重新构建，与 SOSA"可扩展、可升级、即插即用"直接冲突。

**工程方案**：
- **Widget 注册表**：在 `src/components/dashboard/index.js` 引入 `widgetRegistry: Map<type, {component, schema, defaultSize}>`，组件自注册；`DashboardContainer` 改用 `<component :is="descriptor.component">` 渲染。新组件=新建文件+自注册，零核心改动。
- **算法目录 (Algorithm Catalog)**：后端提供 `GET /algorithms` 返回已注册算法及其契约版本/作者/标签；前端"创建任务"从目录选择类型，而非直接 `instanceApi.start()` 一个匿名实例。

### 缺陷 3：缺少一致性认证闸口（违 MOSA / OMS）

**现状**：文档明确"所有软硬件接入都需要经过一致性认证"。当前任何实例一旦 `start()` 成功就被直接使用，**没有任何校验它是否真的实现了 `/train` 且输出 schema 正确**。一个不合规的供应商算法会在训练中途才崩溃。

**工程方案**：实例启动后跑一次**一致性探针 (conformance probe)**——`/manifest` → `/health` → 用极小样本做一次 `load→infer` → 校验输出 schema。通过才在目录中标为"已认证 (conformant)"，并在 UI 显式展示认证状态；未通过则降级或拒绝注册。这把"运行时炸"前移为"接入时拒"。

### 缺陷 4：基础设施强耦合、路径硬编码（违 OSA 可移植性）

**现状**：
- `vite.config.ts` 把 `192.168.31.13:8001 / localhost:8000 / 4096` 等地址硬编码进代理。
- `src/stores/task.ts` 的 `convertPath()` 把 `/mnt/d` 替换成 `\\192.168.31.13`——**文件服务器地址写死在前端**。
- `src/stores/task.ts` 的 opencode `sessionOpts` 硬编码 `base/user`。

**影响**：换一套部署环境（换 IP、换文件服务器、换 OS）就要改前端代码并重新构建。完全丧失"跨平台复用、可独立采购"。

**工程方案**：
- 端点全部走 `import.meta.env.VITE_*`（`.env.development/.env.production`），代理 target 也由环境变量驱动；移除前端任何 IP 字面量。
- **把 `convertPath` 推到后端**：`/api/highlevel` 或任务后端应直接返回 Windows 可用的 `work_dir`，前端不感知文件服务器拓扑。这是最重要的一步——前端不应理解存储布局。

### 缺陷 5：没有正式的公共数据模型（违 FACE）

**现状**：FACE 的核心价值是"正式指定的数据模型"。本系统的数据交换是**按调用临时约定**的：CSV 列名、`DatasetPayload`、`ModelResult` 都没有跨算法的公共模型，每个算法各自解释"健康数据"长什么样。

**工程方案**：定义版本化的 **PHM 公共数据模型**：`SensorSample`、`HealthRecord`、`TaskIO` 三类 schema，所有算法的输入输出都映射到它。算法内部仍可用任意框架（PyTorch/规则/信号处理），但对外只讲公共模型——这正是 FACE"公共操作环境"的做法，也是"是什么 vs 如何做"的典型体现。

### 缺陷 6：编排逻辑下沉在 UI 层，缺服务总线抽象（违 OMS）

**现状**：OMS 要求平台与载荷通过标准服务总线解耦。但本系统的多后端编排**写在前端 store 里**——`src/stores/task.ts` 的 `createTask` 是 5 步级联（启动实例→转路径→建 opencode 会话→存任务→刷新），`deleteTask` 是 5 步反向级联。前端直接掌握了 instance↔opencode↔task 的内部接线。

**影响**：这是典型的"烟囱式"——接线知识固化在 UI，换任一后端拓扑（如把 opencode 合进实例）都要改前端。

**工程方案**：抽出 **算法生命周期服务 (Algorithm Lifecycle Service)** 接口，对外只暴露 `create / configure / train / infer / dispose` 五个语义操作；当前的 5 步级联变成它的一个默认实现。前端只调这个接口。理想形态是后端提供一个编排端点（真正的"服务总线"），前端退化为纯调用方。即使暂不动后端，前端层面把编排收口到一个 service 模块，也已显著降低耦合。

### 缺陷 7：单体构建、无运行时模块加载（违 SOSA 即插即用）

**现状**：整个前端是一个 bundle，`vite.config.ts` 的 `manualChunks` 只拆了 vendor。新增 UI 模块必须重新构建部署。

**工程方案**：对 Widget 包引入 **Vite Module Federation**（`vite-plugin-federation`）或远程动态 `import()`，使第三方 UI 模块能以独立 bundle 在运行时挂载到 widget 注册表。这是实现 SOSA"即插即用、可扩展"的最后一公里，可低优先级推进。

### 缺陷 8：缺少统一遥测/事件总线（违 SOSA / OMS 互操作）

**现状**：训练进度靠**每实例轮询** `src/api/instance-worker.ts` 的 `/state/{n}`；SSE 只服务 opencode 对话。各模块的事件通道彼此割裂。

**工程方案**：建立**统一事件总线**——一个多路复用的 SSE/WS 端点，事件按 `{source, type, payload}` 标准信封分发；任何模块发布、任何 widget 订阅。训练进度、推理结果、健康告警走同一通道，widget 声明式订阅。

### 缺陷 9：接口文档非机器可读、易漂移（违 OSA 标准接口）

**现状**：`数据接口.md`、`文档接口.md` 是手写 Markdown，与代码无校验关联，必然漂移。实例自带的 OpenAPI 反而没用上。

**工程方案**：以 OpenAPI Spec 为唯一事实源；用 `openapi-typescript` 生成 `src/types/entities.ts` 的类型；API 在路径/头中带版本号（`/v1/...`），标记废弃。

### 缺陷 10：安全/隔离边界薄弱（违 OMS 认证/隔离）

**现状**：`src/lib/opencode-api.ts` 用了 Basic Auth，但 instance-worker、task 端点看不到鉴权；级联中一处超时会拖垮整条链（client 已有 timeout，但无熔断）。

**工程方案**：在所有后端前加统一的 API 网关/Token 鉴权；为每个服务加**熔断器 (circuit breaker)**，单模块故障不扩散；为一致性认证配套测试夹具。

## 四、分阶段实施路线（按"先立接口、后扩能力"排序）

| 阶段 | 目标 | 缺陷 | 落地物 | 可纯前端 |
|---|---|---|---|---|
| **P0 打地基** | 让"接口"成为唯一事实源 | G1·G4·G9 | 算法模块契约 Schema + 版本号；端点环境变量化；`convertPath` 下沉后端；OpenAPI 生成类型 | G4/G9 前端可做，G1 需后端协同 |
| **P1 解编排** | 把接线从前端抽走 | G6·G3 | Algorithm Lifecycle Service 接口 + 默认实现；实例启动一致性探针 | G6 前端可重构，G3 需后端探针端点 |
| **P2 开能力** | 让新模块能"插"进来 | G2·G5 | Widget 注册表 + 算法目录；PHM 公共数据模型 | Widget 注册表纯前端可做 |
| **P3 上成熟度** | 即插即用 + 互操作 + 安全 | G7·G8·G10 | Module Federation；统一事件总线；网关 + 熔断 | 多数需后端协同 |

## 五、一句话结论

当前项目**已经具备开放式架构的"骨架"**（模块化领域模型、热插拔算法实例、可配置 Dashboard、多后端客户端），但还停留在**"实现耦合接口"**而非**"声明标准接口"**的阶段——接口藏在 TS 类型与前端编排代码里，没有版本、没有能力自描述、没有一致性闸口，且基础设施地址写死在前端。

**最高杠杆的三件事**：① 把每个实例已有的 OpenAPI (`doc_url`) 升级为带版本的能力契约并前端校验（缺陷 1）；② 把 `convertPath` 和硬编码 IP 移出前端（缺陷 4）；③ 把 `createTask/deleteTask` 的多后端级联收口到一个生命周期服务接口（缺陷 6）。做完这三件，系统就从"能跑的定制集成"跨进"可互换、可认证的开放架构"门槛。
