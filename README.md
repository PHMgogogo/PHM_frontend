# PHM 开放式架构平台

基于 Vue 3 的 PHM（故障预测与健康管理）开放式架构平台前端，支持多飞机构型、算法数据源管理与 LLM 流式对话。

---

## 技术栈

| 技术 | 版本 | 用途 |
|---|---|---|
| Vue 3 | ^3.5 | 核心框架（Composition API） |
| TypeScript | ~6.0 | 类型安全 |
| Vite | ^8.0 | 构建工具 |
| Vue Router | ^4.6 | 客户端路由 |
| Pinia | ^3.0 | 状态管理 |
| Element Plus | ^2.14 | UI 组件库 |
| @element-plus/icons-vue | ^2.3 | 图标库 |

---

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 类型检查 + 生产构建
npm run build

# 预览生产构建
npm run preview
```

开发服务器默认运行于 `http://localhost:5173`。

---

## 项目结构

```
src/
├── lib/
│   └── opencode-api.ts          # OpenCode HTTP/SSE API 封装
├── stores/
│   ├── aircraft.ts              # 飞行器与构型状态
│   ├── chat.ts                  # 对话状态（连接、会话、消息、SSE）
│   ├── dataSource.ts            # 算法数据源状态
│   └── algorithm.ts             # 算法状态
├── components/
│   ├── SideNav.vue              # 首页左侧导航栏
│   ├── AircraftCard.vue         # 飞行器卡片
│   ├── AddAircraftDialog.vue    # 添加飞行器弹窗（含构型管理）
│   └── MessageFeed.vue          # 聊天消息流组件
├── views/
│   ├── HomeView.vue             # 首页（飞行器管理）
│   └── AircraftWorkspace.vue    # 飞行器工作区
└── router/
    └── index.ts                 # 路由配置
```

---

## 功能模块

### 一、首页 — 飞行器管理

路由：`/`

页面采用 **左 15% 导航栏 + 右 85% 内容区** 布局，深蓝色工业风主题。

**左侧导航栏**包含三个菜单项：

| 菜单 | 状态 |
|---|---|
| ✈️ 飞行器管理 | 已完整实现 |
| 📚 知识库管理 | 占位（待开发） |
| 📡 实时监控 | 占位（待开发） |

**飞行器管理页面**功能：

- 实时搜索筛选（匹配飞行器名称、属性、构型名称）
- 响应式卡片网格布局，hover 动效
- 点击卡片进入飞行器工作区
- 「添加飞行器」按钮打开弹窗表单

**添加飞行器弹窗**：

- 飞行器名称（必填）
- 飞行器属性（固定翼 / 旋翼机 / 无人机 / 运输机 / 战斗机 / 侦察机）
- 所属构型（可选，可从已有列表选择或在内嵌面板中新建）
- 内嵌构型管理面板（无多层 Modal），支持新建与删除构型

---

### 二、构型管理

构型是飞行器数据列与业务字段的映射关系，内嵌于添加飞行器弹窗中。

**构型数据结构**：

```ts
interface AircraftConfig {
  id: string
  configName: string
  mappings: Record<string, string>  // { "飞行时间": "1", "发动机温度": "23" }
}
```

**规则**：

- `飞行时间` 字段为**必填映射**，不可删除
- 支持动态添加 / 删除其他字段
- 删除构型前有确认提示
- 删除构型后自动解绑关联飞行器

---

### 三、飞行器工作区

路由：`/aircraft/:id`

点击首页任意飞行器卡片后进入独立工作区，布局切换为工作区专用侧边栏。

**左侧导航**：

| 菜单 | 说明 |
|---|---|
| 💬 当前对话 | 默认选中，LLM 流式对话 |
| 🗂️ 数据管理 | 算法数据源管理 |
| 🧠 算法管理 | 算法实例管理 |

---

#### 3.1 当前对话

- 进入页面后**自动连接** OpenCode 服务（`http://127.0.0.1:4096`），无需手动填写配置
- 自动初始化或打开最近一次会话
- 支持**多会话**管理：新建、切换、删除
- **流式输出**：通过 SSE 实时推送 token，逐字追加显示
- **Markdown 渲染**：加粗、斜体、行内代码、换行
- **消息气泡类型**：
  - 普通文本：蓝色（用户） / 白色（助手）
  - 思考过程（reasoning）：**米黄色系**背景，可折叠
  - 工具调用（tool）：**浅绿色系**背景，可折叠，展示输入/输出/错误
- AI 主动提问面板（question.asked）
- 中止生成按钮
- 自动滚动到底部
- `Ctrl+Enter` 快捷发送

**OpenCode 连接默认配置**（修改 `src/stores/chat.ts` 中的 `DEFAULT_OPTS`）：

```ts
const DEFAULT_OPTS = {
  base: 'http://127.0.0.1:4096',   // OpenCode 服务地址
  dir: 'D:\\your\\project',         // 工作目录
  user: 'opencode',
  pass: '',                         // 无密码留空
}
```

---

#### 3.2 数据管理

**前置约束**：飞行器必须已绑定构型，否则显示引导提示，提供「编辑构型」入口（复用首页构型管理组件）。

功能：

- 以表格形式展示当前飞行器的全部**算法数据源**
- 「创建算法数据源」弹窗：
  - 填写数据源名称
  - 从当前构型的 `mappings` 键名中多选字段（展示业务字段名，非列号）
- 删除数据源（同步删除关联算法）

**算法数据源数据结构**：

```ts
interface DataSource {
  id: string
  aircraftId: string
  name: string
  selectedFields: string[]
}
```

---

#### 3.3 算法管理

**前置约束**：必须已创建至少一个算法数据源，否则显示引导提示跳转到数据管理。

功能：

- 以表格形式展示当前飞行器的全部**算法**
- 「创建算法」弹窗：填写算法名称、选择算法数据源
- 算法状态展示：未启动 / 运行中 / 已停止 / 异常
- 删除算法

**算法数据结构**：

```ts
interface Algorithm {
  id: string
  aircraftId: string
  name: string
  dataSourceId: string
  dataSourceName: string
  status: 'idle' | 'running' | 'stopped' | 'error'
}
```

---

## 实体依赖关系

```
飞行器 (Aircraft)
  └─ 构型 (AircraftConfig)
       └─ 算法数据源 (DataSource)
            └─ 算法 (Algorithm)
```

**业务约束**：

1. 无构型 → 不能创建算法数据源
2. 无算法数据源 → 不能创建算法
3. 算法数据源的字段必须来源于当前飞行器所属构型

---

## 状态管理

| Store | 职责 |
|---|---|
| `aircraftStore` | 飞行器列表、构型列表的 CRUD |
| `chatStore` | OpenCode 连接、会话、消息、SSE 实时推送 |
| `dataSourceStore` | 算法数据源 CRUD |
| `algorithmStore` | 算法 CRUD 与状态流转 |

当前所有数据使用**内存 Mock**，刷新后重置（含预置 Mock 数据用于演示）。

---

## 对接 OpenCode 服务

项目通过 `src/lib/opencode-api.ts` 封装与 [OpenCode](https://opencode.ai) 后端的通信，支持：

- `GET /global/health` — 健康检查
- `GET /provider` — 获取可用模型列表
- `GET /session` — 获取会话列表
- `POST /session` — 创建会话
- `GET /session/:id/message` — 获取消息列表
- `POST /session/:id/prompt_async` — 异步发送消息
- `POST /session/:id/abort` — 中止生成
- `DELETE /session/:id` — 删除会话
- `GET /event` — SSE 实时事件流（流式 token、状态更新、AI 提问）

> 使用前请确保本地已启动 OpenCode 服务，并按需修改 `src/stores/chat.ts` 中的 `DEFAULT_OPTS`。
