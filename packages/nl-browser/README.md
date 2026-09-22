# @moni/nl-browser 🤖🌐

[![npm version](https://img.shields.io/npm/v/@moni/nl-browser.svg)](https://www.npmjs.com/package/@moni/nl-browser)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

An autonomous natural language browser automation library built on top of [`@moni/cdp-driver`](../cdp-driver). Powered by a **Dual-Engine Architecture**:
- **JEV Policy Model**: High-precision, ultrafast UI decision-making (`CLICK`, `TYPE_TEXT`, `SELECT`, `WAIT`, `DONE`, `BLOCKED`).
- **LLM Text Helper**: OpenAI-compatible model (DeepSeek, GPT-4o, etc.) dedicated specifically to inferring exact field input contents when typing is needed.

> **[English](#english-documentation)** | **[中文文档](#中文文档)**

---

<a id="english-documentation"></a>

## English Documentation

### 1. Architecture: Dual-Engine Design

Unlike conventional LLM web agents that force general-purpose LLMs to read raw HTML or output verbose code/JSON tool calls for every click, `@moni/nl-browser` decouples UI decisions from content generation:

1. **Perception & Action Space (`@moni/cdp-driver`)**:
   - Atomically captures interactive elements with pre-flight guards (visibility, `:disabled`, `elementFromPoint` occlusion testing).
   - Maps raw elements into indexed action candidates.
2. **UI Policy Engine (JEV Model)**:
   - Evaluates the user's `goal` against the structured `actionSpace`.
   - Directly decides the next discrete operation (`CLICK`, `TYPE_TEXT`, `SELECT`, `WAIT`, `DONE`, `BLOCKED`) and the target element index.
3. **Semantic Text Helper (LLM)**:
   - **Invoked only when JEV decides `TYPE_TEXT`**.
   - Receives the focused field's context (`label`, `role`, nearby page text) and the user's overall goal.
   - Generates the exact string to type (`{"text": "..."}`).

---

### 2. Installation

```bash
pnpm add @moni/nl-browser @moni/cdp-driver
```

---

### 3. Quick Start

```typescript
import { runTask } from '@moni/nl-browser';

async function main() {
  const result = await runTask({
    startUrl: 'https://news.ycombinator.com',
    goal: 'Search for "AI Agent" and open the first discussion thread',
    jev: {
      apiKey: process.env.TYPESAFE_API_KEY,
    },
    textModel: {
      apiKey: process.env.TEXT_MODEL_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
  });

  console.log(`Finished with status: ${result.status} in ${result.steps} steps!`);
  console.log(`Final URL: ${result.finalUrl}`);
}

main().catch(console.error);
```

---

### 4. API Reference

#### `NLBrowser` Class

The stateful autonomous agent orchestrating JEV decisions, LLM text generation, and CDP browser execution.

```typescript
export class NLBrowser {
  public readonly browser: Browser;
  public readonly state: InternalAgentState;

  static async create(url: string, goal: string | string[], options?: NLBrowserOptions): Promise<NLBrowser>;

  // Execution methods
  run(): AsyncGenerator<AgentSnapshot, TaskResult, unknown>;
  execute(): Promise<TaskResult>;

  // Fine-grained step control
  predict(): Promise<DecisionResult>;
  act(): Promise<AgentSnapshot>;
  tick(): Promise<AgentSnapshot>;

  // Inspection & lifecycle
  snapshot(): AgentSnapshot;
  close(): Promise<void>;
}
```

#### `runTask(options: RunTaskOptions): Promise<TaskResult>`
One-shot convenience runner that automatically connects Chrome, executes the goal to completion, closes the session, and returns `TaskResult`.

#### Options & Configuration

##### `NLBrowserOptions`
| Option | Type | Description |
| :--- | :--- | :--- |
| `browser` | `Browser` | Optional existing `@moni/cdp-driver` Browser instance. |
| `cdpUrl` | `string` | Optional Chrome DevTools WebSocket URL. Auto-discovered if omitted. |
| `jev.apiKey` | `string` | JEV / TypeSafe API key (`process.env.TYPESAFE_API_KEY`). |
| `jev.baseUrl` | `string` | JEV API endpoint (default: `https://api.typesafe.ai/v1/systemone`). |
| `jev.model` | `string` | JEV model name (default: `jev-latest`). |
| `textModel.apiKey` | `string` | LLM API key (`process.env.TEXT_MODEL_API_KEY` or `OPENAI_API_KEY`). |
| `textModel.baseUrl` | `string` | OpenAI-compatible endpoint (default: `https://api.deepseek.com/v1`). |
| `textModel.model` | `string` | Model name (default: `deepseek-chat`). |
| `maxSteps` | `number` | Maximum allowed decision steps (default: `60`). |
| `screenshots` | `boolean` | Whether to capture viewport screenshots on each step (default: `true`). |
| `recordDir` | `string` | Optional directory path to save frame recordings (`.jpg`). |

---
---

<a id="中文文档"></a>

## 中文文档

### 1. 架构核心：双引擎协作机制

传统的 Web Agent 往往直接让大语言模型（LLM）阅读几万 Token 的 HTML 文本并猜测 CSS 选择器，极易发生幻觉、误触且延迟极高。

`@moni/nl-browser` 采用**双引擎职责解耦架构**（参考自 `jev-demo`）：

1. **感知与执行底座（`@moni/cdp-driver`）**：
   - 原子级捕获页面可交互控件与结构化快照。
   - 物理输入前进行 5 重防误触校验（CSS 可见性、非禁用态、`elementFromPoint` 物理顶层防遮挡测试）。
2. **UI 决策引擎（JEV Policy Model）**：
   - 专门负责页面操作策略判断。对比用户目标 `goal` 与可操作控件空间（`actionSpace`），直接决策下一步操作（`CLICK`、`TYPE_TEXT`、`SELECT`、`WAIT`、`DONE`、`BLOCKED`）与目标元素序号。
3. **文本填充助手（LLM Text Helper）**：
   - **仅在 JEV 决策为 `TYPE_TEXT`（需要向输入框填入内容）时才被调用**。
   - 接收当前输入框的上下文（`label`、`role`、周边页面文本）与用户整体目标，生成需要键入的准确文本（输出标准 JSON：`{"text": "..."}`）。

---

### 2. 安装

```bash
pnpm add @moni/nl-browser @moni/cdp-driver
```

---

### 3. 快速上手

```typescript
import { runTask } from '@moni/nl-browser';

async function main() {
  const result = await runTask({
    startUrl: 'https://www.google.com/travel/flights',
    goal: '搜索下周从北京到东京的机票',
    jev: {
      apiKey: process.env.TYPESAFE_API_KEY,
    },
    textModel: {
      apiKey: process.env.TEXT_MODEL_API_KEY,
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    },
  });

  console.log(`执行状态: ${result.status}, 共消耗 ${result.steps} 步`);
  console.log(`当前页面: ${result.pageTitle} (${result.finalUrl})`);
}

main().catch(console.error);
```

---

### 4. 详细 API 参考

#### 核心入口类 `NLBrowser`

```typescript
export class NLBrowser {
  // 工厂创建方法
  static async create(url: string, goal: string | string[], options?: NLBrowserOptions): Promise<NLBrowser>;

  // 1. 全自动执行（流式 Generator，实时向前端推送进度）
  run(): AsyncGenerator<AgentSnapshot, TaskResult, unknown>;

  // 2. 一键执行完成并返回最终结果
  execute(): Promise<TaskResult>;

  // 3. 单步调试控制
  predict(): Promise<DecisionResult>; // JEV 决策下一步
  act(): Promise<AgentSnapshot>;       // LLM 生成输入内容并由 CDP 驱动执行
  tick(): Promise<AgentSnapshot>;      // 组合：predict + act

  // 状态快照与关闭
  snapshot(): AgentSnapshot;
  close(): Promise<void>;
}
```

#### 配置参数 `NLBrowserOptions`
- `browser`: 可选已有 `Browser` 实例进行复用。
- `cdpUrl`: 可选自定义 Chrome 调试端口，未传时自动探测。
- `jev`:
  - `apiKey`: JEV / TypeSafe API 密钥。
  - `baseUrl`: JEV 服务端地址（默认 `https://api.typesafe.ai/v1/systemone`）。
  - `model`: 模型名称（默认 `jev-latest`）。
- `textModel`:
  - `apiKey`: 文本大模型 API 密钥。
  - `baseUrl`: OpenAI 兼容接口地址（默认 `https://api.deepseek.com/v1`）。
  - `model`: 文本大模型名称（默认 `deepseek-chat`）。
  - `reasoning`: 思考模式（`'low' | 'none' | 'disabled'`）。
- `maxSteps`: 最大步数预算（默认 `60` 步）。
- `screenshots`: 是否每步截取视口快照（默认 `true`）。
- `recordDir`: 保存录屏帧序列（`.jpg`）的目录路径。

---

## License

MIT © [Moni Project](https://github.com/kidyfirst/use-browser-by-cdp)
