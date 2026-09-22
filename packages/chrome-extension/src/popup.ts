/**
 * Popup UI logic for Moni Browser Agent Chrome Extension.
 */

import { autoLaunchChrome, checkCDPStatus, getLaunchCommands } from './cdp-helper.js';
import { getStoredSettings, saveRecentGoal, saveStoredSettings, type ModelSettings } from './storage.js';

let currentSettings: ModelSettings;
let selectedOS: 'mac' | 'win' | 'linux' = 'mac';
const launchCommands = getLaunchCommands();

function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 2500);
  }
}

async function initActiveTabUrl(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('edge://')) {
      const urlInput = document.getElementById('targetUrlInput') as HTMLInputElement;
      if (urlInput && !urlInput.value) {
        urlInput.value = tab.url;
      }
    }
  } catch {
    // ignore
  }
}

async function refreshCDPStatus(): Promise<void> {
  const indicator = document.getElementById('statusIndicator');
  const banner = document.getElementById('cdpGuideBanner');
  const bannerTitle = document.getElementById('cdpBannerTitle');
  const bannerDesc = document.getElementById('cdpBannerDesc');
  const commandArea = document.getElementById('cdpCommandArea');

  const status = await checkCDPStatus(currentSettings.serverUrl);

  if (status.cdpPortOpen && status.serverRunning) {
    // Both CDP port 9222 and local server are ready!
    if (indicator) {
      indicator.className = 'status-dot online';
      indicator.title = status.connected
        ? `CDP 任务运行中: ${status.currentUrl || 'Active'}`
        : `✓ CDP (9222) 与本地服务已就绪 (${status.browserVersion || 'Chrome'})`;
    }
    if (banner) banner.style.display = 'none';
  } else if (status.cdpPortOpen && !status.serverRunning) {
    // Port 9222 is open, but local pnpm dev server is not running
    if (indicator) {
      indicator.className = 'status-dot';
      indicator.title = '本地服务未连接 (http://localhost:5173)';
    }
    if (banner) {
      banner.style.display = 'flex';
      if (bannerTitle) bannerTitle.textContent = '⚠️ 本地后台服务未启动';
      if (bannerDesc) {
        bannerDesc.innerHTML = `已检测到 Chrome 9222 调试端口就绪，但后台服务 (${currentSettings.serverUrl}) 未响应。<br />请在项目根目录终端运行 <code>pnpm dev</code>。`;
      }
      if (commandArea) commandArea.style.display = 'none';
    }
  } else if (!status.cdpPortOpen && status.serverRunning) {
    // Server is running, but Chrome port 9222 is not open
    if (indicator) {
      indicator.className = 'status-dot';
      indicator.title = '未检测到 Chrome 9222 调试端口';
    }
    if (banner) {
      banner.style.display = 'flex';
      if (bannerTitle) bannerTitle.textContent = '⚠️ 未检测到 CDP 调试端口 (9222)';
      if (bannerDesc) {
        bannerDesc.innerHTML = `后台服务正常运行，但 Chrome 尚未开启 9222 端口。<br />如已打开 Chrome，请先完全退出 (Cmd+Q) 或使用下方命令启动独立调试实例：`;
      }
      if (commandArea) commandArea.style.display = 'block';
      updateLaunchCommand();
    }
  } else {
    // Neither is running
    if (indicator) {
      indicator.className = 'status-dot';
      indicator.title = 'CDP 端口与后台服务均未就绪';
    }
    if (banner) {
      banner.style.display = 'flex';
      if (bannerTitle) bannerTitle.textContent = '⚠️ 未检测到 CDP 调试端口与后台服务';
      if (bannerDesc) {
        bannerDesc.innerHTML = `需开启 <code>--remote-debugging-port=9222</code>，并在项目根目录运行 <code>pnpm dev</code>。`;
      }
      if (commandArea) commandArea.style.display = 'block';
      updateLaunchCommand();
    }
  }
}

function updateLaunchCommand(): void {
  const cmdText = document.getElementById('launchCommandText');
  if (cmdText) {
    cmdText.textContent = launchCommands[selectedOS];
  }
}

function setupOSTabs(): void {
  const tabMac = document.getElementById('tabMacBtn');
  const tabWin = document.getElementById('tabWinBtn');
  const tabLinux = document.getElementById('tabLinuxBtn');

  const setTab = (os: 'mac' | 'win' | 'linux', activeBtn: HTMLElement | null) => {
    selectedOS = os;
    [tabMac, tabWin, tabLinux].forEach((b) => {
      if (b) b.style.fontWeight = 'normal';
    });
    if (activeBtn) activeBtn.style.fontWeight = 'bold';
    updateLaunchCommand();
  };

  tabMac?.addEventListener('click', () => setTab('mac', tabMac));
  tabWin?.addEventListener('click', () => setTab('win', tabWin));
  tabLinux?.addEventListener('click', () => setTab('linux', tabLinux));

  const copyBtn = document.getElementById('copyCmdBtn');
  copyBtn?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(launchCommands[selectedOS]);
    showToast('✓ 已复制 Chrome 启动命令到剪贴板');
  });

  const autoLaunchBtn = document.getElementById('autoLaunchChromeBtn');
  autoLaunchBtn?.addEventListener('click', async () => {
    showToast('⏳ 正在拉起调试 Chrome 浏览器...');
    if (autoLaunchBtn) autoLaunchBtn.setAttribute('disabled', 'true');
    try {
      const res = await autoLaunchChrome(currentSettings.serverUrl);
      if (res.success) {
        showToast('✓ 调试 Chrome 启动成功！');
        await refreshCDPStatus();
      } else {
        showToast(`❌ 启动失败: ${res.error || '未知错误'}`);
      }
    } finally {
      if (autoLaunchBtn) autoLaunchBtn.removeAttribute('disabled');
    }
  });

  const copyPnpmBtn = document.getElementById('copyPnpmCmdBtn');
  copyPnpmBtn?.addEventListener('click', async () => {
    await navigator.clipboard.writeText('pnpm run start:chrome');
    showToast('✓ 已复制命令: pnpm run start:chrome');
  });
}

function renderHistoryItem(item: any): void {
  const logList = document.getElementById('logList');
  const logSection = document.getElementById('logSection');
  const logCount = document.getElementById('logCount');

  if (logSection) logSection.style.display = 'flex';

  if (logList) {
    const itemEl = document.createElement('div');
    itemEl.className = 'log-item';
    itemEl.innerHTML = `
      <div class="log-header">
        <span>#${item.step} [${item.operation}] ${item.action || ''}</span>
        <span style="color: var(--text-muted); font-size: 10px;">${item.latency_ms || 0}ms</span>
      </div>
      ${
        item.text !== null && item.text !== undefined
          ? `<div style="color: #fbbf24; font-size: 11px;">✍️ "${item.text}"</div>`
          : ''
      }
    `;
    logList.appendChild(itemEl);
    logList.scrollTop = logList.scrollHeight;
  }

  if (logCount) {
    logCount.textContent = String(logList?.children.length || 0);
  }
}

function setupTaskActions(): void {
  const runAutoBtn = document.getElementById('runAutoBtn') as HTMLButtonElement;
  const stepTickBtn = document.getElementById('stepTickBtn') as HTMLButtonElement;
  const stopBtn = document.getElementById('stopBtn') as HTMLButtonElement;
  const urlInput = document.getElementById('targetUrlInput') as HTMLInputElement;
  const goalInput = document.getElementById('goalInput') as HTMLTextAreaElement;
  const badge = document.getElementById('agentStatusBadge');

  const startOrGetAgent = async () => {
    const targetUrl = urlInput.value.trim();
    const goal = goalInput.value.trim();
    if (!targetUrl || !goal) {
      alert('请填写目标网页 URL 和任务目标');
      return false;
    }
    await saveRecentGoal(goal);

    const res = await fetch(`${currentSettings.serverUrl}/api/nl/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUrl, goal }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || '启动 Agent 失败');
    }
    return true;
  };

  runAutoBtn?.addEventListener('click', async () => {
    runAutoBtn.disabled = true;
    stepTickBtn.disabled = true;
    stopBtn.style.display = 'inline-flex';
    if (badge) badge.textContent = '运行中...';

    try {
      showToast('正在启动并执行任务...');
      const ready = await startOrGetAgent();
      if (!ready) return;

      const res = await fetch(`${currentSettings.serverUrl}/api/nl/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '执行任务失败');
      }

      if (badge) badge.textContent = `完成: ${data.result.status}`;
      showToast(`任务结束: ${data.result.status} (共 ${data.result.steps} 步)`);

      const logList = document.getElementById('logList');
      if (logList) logList.innerHTML = '';
      (data.result.history || []).forEach(renderHistoryItem);
    } catch (err: any) {
      alert(`运行出错: ${err.message}`);
    } finally {
      runAutoBtn.disabled = false;
      stepTickBtn.disabled = false;
      stopBtn.style.display = 'none';
    }
  });

  stepTickBtn?.addEventListener('click', async () => {
    stepTickBtn.disabled = true;
    try {
      showToast('单步执行中...');
      const ready = await startOrGetAgent();
      if (!ready) return;

      const res = await fetch(`${currentSettings.serverUrl}/api/nl/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'tick' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '单步执行失败');
      }

      const snap = data.snapshot;
      if (badge) badge.textContent = `状态: ${snap.status}`;
      showToast(`单步执行完毕，状态: ${snap.status}`);

      const latestHistory = snap.history[snap.history.length - 1];
      if (latestHistory) {
        renderHistoryItem(latestHistory);
      }
    } catch (err: any) {
      alert(`单步出错: ${err.message}`);
    } finally {
      stepTickBtn.disabled = false;
    }
  });

  stopBtn?.addEventListener('click', async () => {
    try {
      await fetch(`${currentSettings.serverUrl}/api/nl/stop`, { method: 'POST' });
      showToast('Agent 会话已终止');
      if (badge) badge.textContent = '已停止';
    } catch {
      // ignore
    }
  });
}

function setupSettingsModal(): void {
  const toggleBtn = document.getElementById('toggleSettingsBtn');
  const closeBtn = document.getElementById('closeSettingsBtn');
  const saveBtn = document.getElementById('saveSettingsBtn');
  const mainView = document.getElementById('mainView');
  const settingsView = document.getElementById('settingsView');

  const sUrl = document.getElementById('cfgServerUrl') as HTMLInputElement;
  const jKey = document.getElementById('cfgJevApiKey') as HTMLInputElement;
  const jBase = document.getElementById('cfgJevBaseUrl') as HTMLInputElement;
  const jModel = document.getElementById('cfgJevModel') as HTMLInputElement;
  const tKey = document.getElementById('cfgTextApiKey') as HTMLInputElement;
  const tBase = document.getElementById('cfgTextBaseUrl') as HTMLInputElement;
  const tModel = document.getElementById('cfgTextModel') as HTMLInputElement;

  const populateInputs = () => {
    if (sUrl) sUrl.value = currentSettings.serverUrl;
    if (jKey) jKey.value = currentSettings.typesafeApiKey;
    if (jBase) jBase.value = currentSettings.typesafeBaseUrl;
    if (jModel) jModel.value = currentSettings.typesafeModel;
    if (tKey) tKey.value = currentSettings.textModelApiKey;
    if (tBase) tBase.value = currentSettings.textModelBaseUrl;
    if (tModel) tModel.value = currentSettings.textModel;
  };

  toggleBtn?.addEventListener('click', () => {
    populateInputs();
    if (mainView) mainView.style.display = 'none';
    if (settingsView) settingsView.style.display = 'flex';
  });

  closeBtn?.addEventListener('click', () => {
    if (settingsView) settingsView.style.display = 'none';
    if (mainView) mainView.style.display = 'flex';
  });

  saveBtn?.addEventListener('click', async () => {
    currentSettings = {
      serverUrl: sUrl.value.trim() || 'http://localhost:5173',
      typesafeApiKey: jKey.value.trim(),
      typesafeBaseUrl: jBase.value.trim() || 'https://api.typesafe.ai/v1/systemone',
      typesafeModel: jModel.value.trim() || 'jev-latest',
      textModelApiKey: tKey.value.trim(),
      textModelBaseUrl: tBase.value.trim() || 'https://api.deepseek.com/v1',
      textModel: tModel.value.trim() || 'deepseek-chat',
    };
    await saveStoredSettings(currentSettings);
    showToast('✓ 设置已保存');
    if (settingsView) settingsView.style.display = 'none';
    if (mainView) mainView.style.display = 'flex';
    refreshCDPStatus();
  });
}

function setupChipsAndPresets(): void {
  const chips = document.querySelectorAll('.chip');
  const goalInput = document.getElementById('goalInput') as HTMLTextAreaElement;

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const g = chip.getAttribute('data-goal');
      if (g && goalInput) {
        goalInput.value = g;
      }
    });
  });

  const useTabBtn = document.getElementById('useCurrentTabBtn');
  useTabBtn?.addEventListener('click', async () => {
    await initActiveTabUrl();
    showToast('已填入当前标签页地址');
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await getStoredSettings();
  await initActiveTabUrl();
  setupOSTabs();
  setupSettingsModal();
  setupChipsAndPresets();
  setupTaskActions();
  await refreshCDPStatus();
  // Auto refresh CDP & server status every 3 seconds while popup is open
  setInterval(() => {
    refreshCDPStatus();
  }, 3000);
});
