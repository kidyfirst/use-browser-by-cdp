# @moni/cdp-driver 🌐

[![npm version](https://img.shields.io/npm/v/@moni/cdp-driver.svg)](https://www.npmjs.com/package/@moni/cdp-driver)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict%20Mode-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

> **[English](#english-documentation)** | **[中文文档](#中文文档)**

---

<a id="english-documentation"></a>

## English Documentation

### 1. Overview & Purpose

`@moni/cdp-driver` is a general-purpose, high-precision, decoupled Chrome DevTools Protocol (CDP) automation driver designed for server-side environments, autonomous AI browser agents, scraping pipelines, and automated testing.

#### Why `@moni/cdp-driver`?

- **Website-Agnostic & Zero Model Coupling**: Operates purely as a deterministic browser automation actuator. It does not contain any site-specific selectors, scraping rules, or LLM prompt dependencies.
- **Pure TypeScript In-Browser Probes**: In-browser probe scripts (`__moniFast`) are written in strictly-typed TypeScript, eliminating raw, unmaintainable string templates while preserving full type safety.
- **5-Layer Pre-flight Action Guards**: Before clicking or filling an element, the driver verifies:
  1. `isConnected`: Target node is still attached to the live DOM tree.
  2. Non-disabled: Target does not match `:disabled`, `[aria-disabled="true"]`, or `[inert]`.
  3. `checkVisibility`: Visible by CSS opacity, display, and layout dimensions.
  4. Viewport boundaries: Coordinate center falls inside viewport dimensions.
  5. `elementFromPoint` occlusion testing: Target or its descendant is truly the uppermost element at the click coordinates (prevents misclicking floating banners or overlays).
- **Atomic Snapshots & Deterministic Fingerprints**: Collects all interactive page controls (buttons, links, inputs, selects), geometry coordinates, and visible text in a single round-trip, signed with a deterministic SHA-256 fingerprint.
- **Cross-Platform Chrome Auto-Discovery**: Automatically locates Chrome's `DevToolsActivePort` on macOS, Linux, and Windows, bypassing modern Chrome security blocks on `/json/version`.
- **Target `sessionId` Native Routing**: Fully conforms to Chrome's flattened Target CDP architecture.

---

### 2. Installation

```bash
# Using pnpm
pnpm add @moni/cdp-driver

# Using npm
npm install @moni/cdp-driver

# Using yarn
yarn add @moni/cdp-driver
```

---

### 3. Quick Start

```typescript
import { Browser } from '@moni/cdp-driver';

async function main() {
  // 1. Connect to active Chrome session and navigate
  const browser = await Browser.connect('https://example.com');

  // 2. Atomically observe interactive controls and page text
  const page = await browser.observe();
  console.log(`Page: ${page.title} (URL: ${page.url})`);
  console.log(`Observed ${page.actions.length} interactive elements`);

  // 3. Find target element and perform action with occlusion verification
  const linkAction = page.actions.find((act) => act.role === 'link');
  if (linkAction) {
    const result = await browser.act(linkAction);
    console.log(`Action executed: ${result.executed}`);
  }

  // 4. Re-observe updated page state
  const updatedPage = await browser.observe();
  console.log(`Navigated to: ${updatedPage.url}`);

  // 5. Clean up target session
  await browser.close();
}

main().catch(console.error);
```

---

### 4. API Reference

#### `Browser` Class

The primary orchestration class for controlling tabs and executing actions.

```typescript
export class Browser {
  public targetId: string | null;
  public sessionId: string | null;
  public currentUrl: string;
  public readonly transport: CDPTransport;
}
```

##### Static Methods
- **`Browser.connect(url: string, cdpUrl?: string): Promise<Browser>`**
  - Connects to an existing Chrome instance. If `cdpUrl` is omitted, it automatically discovers the active Chrome DevTools port from the system user directory.
  - Creates a new target page, attaches via flattened session protocol, and configures default viewport (`1280x800`).

##### Instance Methods
- **`browser.navigate(url: string): Promise<void>`**
  - Navigates the current target to the specified URL and waits for `document.readyState === 'complete'`.
- **`browser.observe(screenshot = true): Promise<PageState>`**
  - Atomically captures interactive elements, bounding boxes, visible text, scroll offset, and an optional JPEG base64 screenshot.
  - Automatically calculates and attaches a deterministic SHA-256 `fingerprint`.
  - Automatically retries up to 10 times if the DOM is in a transient state (`StalePageError`).
- **`browser.act(action: ObservedAction, options?: ActOptions): Promise<ActResult>`**
  - Executes a physical interaction (`click`, `fill`, `select`, `scroll`, `wait`).
  - Automatically runs pre-flight guards and occlusion tests.
  - `options.text`: Optional text string when executing `fill` actions.
- **`browser.fresh(page: PageState, action?: ObservedAction | null): Promise<boolean>`**
  - Lightweight DOM check to verify if the page or target element is still fresh without running a full snapshot.
- **`browser.close(): Promise<void>`**
  - Closes the attached Chrome target page and tears down the underlying WebSocket transport.

---

#### `WebSocketCDPClient` Class

Low-level, zero-dependency WebSocket transport for Chrome DevTools Protocol.

```typescript
export class WebSocketCDPClient implements CDPTransport {
  constructor(public readonly wsUrl: string);
  connect(): Promise<void>;
  call<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  close(): Promise<void>;
}
```

##### Discovery Function
- **`getChromeWsEndpoint(customUrl?: string): Promise<string>`**
  - Resolves Chrome WebSocket debugger URL from:
    1. Explicit `customUrl`, `process.env.CHROME_WS_ENDPOINT`, or `process.env.CHROME_CDP_URL`.
    2. Platform-specific `DevToolsActivePort` file (`~/Library/Application Support/Google/Chrome/DevToolsActivePort` on macOS, `~/.config/google-chrome/DevToolsActivePort` on Linux, `%LOCALAPPDATA%` on Windows).
    3. Fallback HTTP probe on `http://127.0.0.1:9222/json/version`.

---

#### Core Types & Interfaces

##### `ObservedAction`
Represents an interactive control extracted from the accessibility and DOM trees.

| Field | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique identifier assigned to the action (e.g., `'e1'`, `'wait'`). |
| `node` | `number \| undefined` | Internal index referencing the node in the `__moniFast` node cache. |
| `kind` | `ActionKind` | Interaction category: `'click'`, `'fill'`, `'select'`, `'scroll'`, `'wait'`. |
| `role` | `string` | Semantic ARIA or element role (e.g., `'button'`, `'link'`, `'textbox'`, `'combobox'`). |
| `label` | `string` | Human-readable accessible name or visible text. |
| `value` | `string \| undefined` | Value of input or selected option. |
| `rect` | `ElementRect \| undefined` | Physical geometry `{ x, y, w, h }` in viewport pixels. |
| `delta` | `number \| undefined` | Scroll delta for `'scroll'` actions. |

##### `PageState`
Complete snapshot of the target page state.

| Field | Type | Description |
| :--- | :--- | :--- |
| `url` | `string` | Current live page URL. |
| `title` | `string` | Page document title. |
| `text` | `string` | Clean visible body text. |
| `scroll` | `PageScroll` | Scroll offset `{ y, height }`. |
| `actions` | `ObservedAction[]` | Array of interactable controls. |
| `fingerprint` | `string` | Deterministic SHA-256 fingerprint of URL, text, actions, and scroll. |
| `screenshot` | `string \| undefined` | Base64-encoded JPEG viewport screenshot (quality 72). |

---

#### Error Classes

- **`StalePageError`**: Thrown when the target DOM changes or is occluded during evaluation or between observation and interaction.
- **`CDPConnectionError`**: Thrown when unable to discover or connect to Chrome DevTools WebSocket.
- **`TargetNotFoundError`**: Thrown when the targeted node does not exist in the active cache.

---
---

<a id="中文文档"></a>

## 中文文档

### 1. 库的作用与核心定位

`@moni/cdp-driver` 是一个面向**高精度、服务端、完全解耦**的 Chrome DevTools Protocol (CDP) 浏览器驱动库与底层操作执行器（Actuator）。它专为 **AI 智能体（Autonomous Browser Agents）、网络爬虫数据采集、端到端自动化测试** 打造。

#### 为什么需要 `@moni/cdp-driver`？

1. **网站无关 & 零大模型耦合**
   - 纯粹的浏览器底层操控与状态观察原语，绝不内嵌任何特定网站选择器、业务逻辑或 LLM Prompt 依赖，保持驱动层的通用与纯净。
2. **纯 TypeScript 内嵌探针（无字符串维护痛点）**
   - 传统 CDP 脚本通常以长篇字符串拼接注入，难以重构且极易出错。本库在 [`src/injected/`](src/injected/) 中将快照提取器与操作守卫编写为标准的 TypeScript 函数，在启动时动态序列化（`.toString()`），享有 100% 的编译期类型校验与重构支持。
3. **五重前置防御机制（5-Layer Pre-flight Guards）**
   - 在触发真实物理点击与键盘输入前，自动执行全面防御式校验：
     - **DOM 挂载检测**（`isConnected`）
     - **禁用态检测**（`:disabled`、`aria-disabled`、`inert`）
     - **CSS 可见性检测**（`checkVisibility` 确保透明度与 Display 正确）
     - **视口边界约束**（坐标位于视口可视范围内）
     - **顶层物理防遮挡检测**（`document.elementFromPoint` 验证目标未被弹窗、Toast 或浮动层遮挡，彻底杜绝误触）
4. **原子级页面快照与状态指纹（SHA-256）**
   - 单次通信同时获取所有可交互元素、视口位置、可见文本与 base64 截图。
   - 自动生成确定性哈希指纹，当页面因动态渲染发生漂移时抛出 `StalePageError`，方便调用方精确重试。
5. **跨平台 CDP 端口自动探测**
   - 新版 Chrome 对 `/json/version` HTTP 接口存在安全拦截（返回 404 0-byte）。本库通过原生读取操作系统的 `DevToolsActivePort` 文件，自动定位活跃的 WebSocket 调试端口（支持 macOS、Linux、Windows）。

---

### 2. 安装

```bash
# 使用 pnpm
pnpm add @moni/cdp-driver

# 使用 npm
npm install @moni/cdp-driver

# 使用 yarn
yarn add @moni/cdp-driver
```

---

### 3. 快速上手

```typescript
import { Browser } from '@moni/cdp-driver';

async function main() {
  // 1. 自动定位 Chrome 并连接，开启新标签页并导航
  const browser = await Browser.connect('https://example.com');

  // 2. 原子级捕获页面可交互控件与状态
  const page = await browser.observe();
  console.log(`页面标题: ${page.title}`);
  console.log(`捕获到 ${page.actions.length} 个可交互控件`);

  // 3. 找到目标链接并执行带遮挡校验的物理点击
  const targetLink = page.actions.find((act) => act.role === 'link');
  if (targetLink) {
    const result = await browser.act(targetLink);
    console.log(`操作执行成功: 控件 ID = ${result.executed}`);
  }

  // 4. 输入文本示例 (fillable input)
  const inputAction = page.actions.find((act) => act.kind === 'fill');
  if (inputAction) {
    await browser.act(inputAction, { text: 'Hello, CDP!' });
  }

  // 5. 重新获取更新后的页面
  const newPage = await browser.observe();
  console.log(`更新后页面指纹: ${newPage.fingerprint}`);

  // 6. 关闭会话，清理资源
  await browser.close();
}

main().catch(console.error);
```

---

### 4. 核心 API 文档

#### `Browser` 核心类

负责整体浏览器生命周期管理、目标页面会话（Target Session）管理与操作分发。

```typescript
export class Browser {
  public targetId: string | null;     // Chrome Target 标识符
  public sessionId: string | null;    // 扁平化 Target 会话 ID
  public currentUrl: string;          // 当前页面 URL
  public readonly transport: CDPTransport; // 底层 CDP 通信实例
}
```

##### 静态方法
- **`Browser.connect(url: string, cdpUrl?: string): Promise<Browser>`**
  - 连接到正在运行的 Chrome 实例。
  - 若未显式传入 `cdpUrl`，会自动读取系统 `DevToolsActivePort` 端口。
  - 创建新 Target，建立扁平化连接（`flatten: true`），模拟 `1280x800` 视口，并导航至指定 `url`。

##### 实例方法
- **`browser.navigate(url: string): Promise<void>`**
  - 导航至新 URL 并循环等待 `document.readyState === 'complete'`。
- **`browser.observe(screenshot = true): Promise<PageState>`**
  - 执行原子级 DOM 快照探测，返回结构化页面状态对象。
  - `screenshot`：是否同时截取视口 JPEG 截图（默认 `true`）。
  - 若执行时检测到 DOM 正在变动，内置 10 次退避重试机制。
- **`browser.act(action: ObservedAction, options?: ActOptions): Promise<ActResult>`**
  - 对指定的结构化控件执行操作：
    - `click`：触发真实 `mousePressed` 与 `mouseReleased` 事件。
    - `fill`：全选输入框现有文本，通过 `Input.insertText` 注入 `options.text`。
    - `select`：针对 `<select>` 标签自动触发 `input` 与 `change` 事件。
    - `scroll`：使用 `Input.dispatchMouseEvent` 发送滚轮滚动。
    - `wait`：安全休眠等待页面更新。
- **`browser.fresh(page: PageState, action?: ObservedAction | null): Promise<boolean>`**
  - 高效验证先前的页面快照或指定节点在当前浏览器中是否仍然有效（未被篡改或覆盖）。
- **`browser.close(): Promise<void>`**
  - 关闭通过 CDP 打开的当前 Target 标签页，并断开底层 WebSocket 连接。

---

#### `WebSocketCDPClient` 传输类

轻量原生 WebSocket 客户端，实现 Chrome DevTools Protocol 协议规范：

```typescript
export class WebSocketCDPClient implements CDPTransport {
  constructor(public readonly wsUrl: string);
  connect(): Promise<void>;
  call<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  close(): Promise<void>;
}
```

##### 自动探测函数
- **`getChromeWsEndpoint(customUrl?: string): Promise<string>`**
  - 自动发现本机的 Chrome 调试地址，按以下优先级查找：
    1. 显式传入参数或环境变量 `CHROME_WS_ENDPOINT` / `CHROME_CDP_URL`。
    2. 检查操作系统 Chrome 配置目录中的 `DevToolsActivePort` 文件。
    3. 退避访问 `http://127.0.0.1:9222/json/version`。

---

#### 核心数据类型

##### `ObservedAction` (结构化控件)
```typescript
export interface ObservedAction {
  id: string;              // 唯一 ID（如 "e1", "e2", "wait"）
  node?: number;           // 浏览器 __moniFast 内部缓存节点索程序号
  kind: ActionKind;        // 操作类型: 'click' | 'fill' | 'select' | 'scroll' | 'wait'
  role: string;            // 角色类型（'button', 'link', 'combobox', 'textbox' 等）
  label: string;           // 控件可访问性文本或显示文本
  value?: string;          // 当前控件值
  current_value?: string;  // 原始控件值
  rect?: ElementRect;      // 物理坐标尺寸 { x, y, w, h }
  delta?: number;          // 滚动增量（仅 scroll）
}
```

##### `PageState` (页面状态快照)
```typescript
export interface PageState {
  url: string;             // 页面规范化地址
  title: string;           // 页面 Title
  w?: number;              // 视口宽度
  h?: number;              // 视口高度
  text: string;            // 页面可见正文文本
  scroll: PageScroll;      // 页面滚动位置 { y, height }
  actions: ObservedAction[]; // 所有可操作控件列表
  fingerprint: string;     // SHA-256 页面确定性状态指纹
  screenshot?: string;     // 视口 JPEG base64 截图
}
```

---

#### 错误类型定义

- **`StalePageError`**：页面状态已失效。当快照与当前 DOM 不一致、元素在交互前被移动或被浮层遮挡时抛出。
- **`CDPConnectionError`**：无法发现或连接到 Chrome DevTools Protocol 调试端口。
- **`TargetNotFoundError`**：尝试操作未在缓存或快照中登记的无效节点。

---

### 5. 最佳实践范式 (Best Practices)

#### 稳健的 Agent 交互循环

```typescript
import { Browser, StalePageError } from '@moni/cdp-driver';

async function safeActLoop(browser: Browser, targetRole: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const page = await browser.observe();
    const action = page.actions.find((a) => a.role === targetRole);
    if (!action) throw new Error(`Role ${targetRole} not found`);

    try {
      await browser.act(action);
      return; // 操作成功
    } catch (err) {
      if (err instanceof StalePageError) {
        console.warn(`页面状态发生变动，重新捕获后重试... (第 ${attempt + 1} 次)`);
        continue;
      }
      throw err;
    }
  }
}
```

---

## License

MIT © [Moni Project](https://github.com/use-browser-by-cdp)
