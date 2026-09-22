# use-browser-by-cdp ⚡

> 通用、轻量、高精度的 CDP (Chrome DevTools Protocol) 浏览器驱动与控制 Monorepo。
> 包含通用浏览器驱动核心包 `@moni/cdp-driver` 以及 React + Vite 交互式演示平台 `@moni/web-demo`。

## 特性亮点

1. **零 AI 依赖的通用驱动库 (`@moni/cdp-driver`)**：
   - 完全与特定业务网站、特定 AI 模型解耦。
   - 原生 WebSocket 直连 Chrome 调试端口，自动跨平台发现 `DevToolsActivePort`。
   - 纯 TypeScript 编写的 DOM 探针 (`captureSnapshot` & `resolveActionTarget`)，运行时动态序列化注入 Chrome。
   - 执行前 5 重防遮挡碰撞测试 (`elementFromPoint`) 与动态几何求解，杜绝误触。
   - 标准版本管理与严格发包门禁 (`prepublishOnly` 运行全量测试与自动构建)。
2. **React + Vite 演示与自动化 Agent 服务 (`@moni/web-demo`)**：
   - 运行 `pnpm dev` 一条命令同时唤起 React 界面与内置的 `cdp-agent` 后端服务。
   - 输入任意网址，实时建立 CDP 连接并导航。
   - 下方通过带有防嵌代理的 `iframe` 实时内嵌显示目标网页。
   - 同步输出结构化可交互元素表格与支持折叠/展开、复制的 JSON 树形检视器。

---

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 运行驱动库单元测试

```bash
pnpm test
```

### 3. 构建驱动库 (编译为 JS 库与 .d.ts)

```bash
pnpm --filter @moni/cdp-driver run build
```

### 4. 启动 React 交互式 Demo

```bash
pnpm dev
```
打开 `http://127.0.0.1:5173` 即可开始使用。

---

## 包发布流程

在 `packages/cdp-driver` 目录下：
```bash
# 模拟发布检查
pnpm run publish:dry

# 执行正式发布（包含自动测试与自动构建门禁）
pnpm run publish:pkg
```
