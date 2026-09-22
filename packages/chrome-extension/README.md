# @moni/chrome-extension 🧩🌐

Chrome 浏览器扩展辅助插件，用于辅助运行与调试 [`@moni/cdp-driver`](../cdp-driver) 与 [`@moni/nl-browser`](../nl-browser)。

---

## 核心功能

1. **CDP 端口自动探测与启动引导**
   - 自动检测 Chrome 远程调试端口（`9222`）及本地服务（`http://localhost:5173`）连通状态。
   - 当检测到未开启 CDP 端口时，自动弹出引导提示，并提供 **macOS / Windows / Linux** 的一键复制启动命令。
2. **模型参数配置**
   - 支持在插件界面直接配置 JEV 策略模型与 LLM 文本生成模型的 API Key、Base URL 与 Model 名称。
   - 配置安全持久化保存在 `chrome.storage.local` 中。
3. **自然语言任务输入与执行**
   - 一键获取当前浏览器活动标签页网址（Active Tab URL）。
   - 用户输入一句话任务目标（或点击常用预设），点击 **"🚀 全自动运行"** 或 **"⏭️ 单步 Tick"**，自动驱动浏览器执行任务并实时打印执行时序记录。

---

## 安装与加载方式

### 1. 构建插件
在项目根目录或本目录下执行构建命令：
```bash
pnpm --filter @moni/chrome-extension run build
```
编译产物将输出在 `packages/chrome-extension/dist/`。

### 2. 在 Chrome 中加载已解压的扩展程序
1. 打开 Chrome 浏览器，在地址栏访问：`chrome://extensions`。
2. 在页面右上角开启 **"开发者模式" (Developer mode)**。
3. 点击左上角 **"加载已解压的扩展程序" (Load unpacked)**。
4. 选择目录：`/Users/timlyu/gitcode/github/use-browser-by-cdp/packages/chrome-extension`（或打包后的纯净解包目录 `release/unpacked`）。
5. 扩展即加载完成！点击 Chrome 工具栏右上角的拼图图标，将 **Moni Browser Agent** 固定至工具栏即可点击使用。

---

### 3. 一键打包扩展程序 (ZIP / Release)

用于发布分发或上传至 Chrome Web Store：

```bash
# 方式 1：在插件目录下打包
pnpm run package

# 方式 2：在 monorepo 根目录下统一打包
pnpm run package:extension
```

打包命令会自动完成 TypeScript 编译、校验 Manifest V3 清单规范、生成纯净解压目录与分发 ZIP 压缩包：
- **纯净解压包**：`packages/chrome-extension/release/unpacked/`（仅包含运行时必须的代码与资源，无任何 dev 冗余）
- **分发 ZIP**：`packages/chrome-extension/release/moni-chrome-extension-v0.1.0.zip`
- **最新别名 ZIP**：`packages/chrome-extension/release/moni-chrome-extension-latest.zip`
---

## 开启 Chrome 调试端口 (9222) 的 3 种稳妥方式

由于现代 Chrome 的单例机制与安全策略，如果直接双击打开 Chrome，调试端口可能不会开启。以下是 3 种稳定可靠的启动方式：

### 方式 1：插件界面一键拉起（推荐，零命令行负担）
在开启后台服务（`pnpm dev`）后，打开插件弹窗，直接点击提示横幅中的 **"🚀 一键启动调试 Chrome"** 按钮。
后台服务将自动搜寻本地 Chrome 安装路径，以独立调试 Profile 启动 Chrome 并开启 9222 端口，插件弹窗会在 3 秒内自动检测并转绿。

### 方式 2：使用统一 Node/CLI 命令
在项目根目录下直接运行：
```bash
pnpm run start:chrome
```
该脚本会自动检测 9222 端口状态。若已开启则复用已有进程，未开启则自动以安全的参数启动 Chrome。

### 方式 3：终端手动启动命令
若需在终端手动启动，建议使用带有 `--remote-allow-origins="*"` 与独立 Profile 目录的命令：

- **macOS**:
  ```bash
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222 --remote-allow-origins="*" --user-data-dir="$HOME/.moni-chrome-cdp-profile" --no-first-run
  ```
- **Linux**:
  ```bash
  google-chrome --remote-debugging-port=9222 --remote-allow-origins="*" --user-data-dir="$HOME/.moni-chrome-cdp-profile" --no-first-run
  ```
- **Windows (PowerShell / CMD)**:
  ```cmd
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-allow-origins="*" --user-data-dir="%USERPROFILE%\.moni-chrome-cdp-profile" --no-first-run
  ```
> **提示**：使用 `$HOME/.moni-chrome-cdp-profile` 作为数据目录，可以保证登录态和 Cookie 长期安全保存，无需每次重新扫码登录。

