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
4. 选择目录：`/Users/timlyu/gitcode/github/use-browser-by-cdp/packages/chrome-extension`。
5. 扩展即加载完成！点击 Chrome 工具栏右上角的拼图图标，将 **Moni Browser Agent** 固定至工具栏即可点击使用。

---

## Chrome CDP 启动命令参考

当插件提示未开启 CDP 端口时，需先完全退出 Chrome，并在终端执行相应系统的启动命令：

- **macOS**:
  ```bash
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp-profile
  ```
- **Linux**:
  ```bash
  google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/chrome-cdp-profile
  ```
- **Windows (CMD/PowerShell)**:
  ```cmd
  "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\chrome-cdp-profile"
  ```
