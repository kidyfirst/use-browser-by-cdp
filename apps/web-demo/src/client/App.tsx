import React, { useState, useEffect, useCallback } from 'react';
import type { PageState, ObservedAction } from '@moni/cdp-driver';
import { Sidebar, type ActiveModule } from './components/Sidebar';
import { CDPDriverView } from './components/CDPDriverView';
import { NLBrowserView } from './components/NLBrowserView';

export const App: React.FC = () => {
  const [activeModule, setActiveModule] = useState<ActiveModule>('cdp-driver');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [pageState, setPageState] = useState<PageState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Check initial agent status
  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/status');
      if (res.ok) {
        const data = await res.json();
        setIsConnected(data.connected);
        if (data.url && !currentUrl) {
          setCurrentUrl(data.url);
        }
      }
    } catch {
      setIsConnected(false);
    }
  }, [currentUrl]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleLaunchBrowser = async () => {
    try {
      showToast('正在启动调试 Chrome 浏览器...');
      const res = await fetch('/api/agent/launch-browser', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('✓ 调试 Chrome 启动成功，端口 9222 已就绪');
        checkStatus();
      } else {
        alert(`启动失败: ${data.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`无法连接后台服务: ${err.message}`);
    }
  };

  const handleNavigate = async (url: string) => {
    setIsLoading(true);
    try {
      showToast(`Navigating to ${url}...`);
      const res = await fetch('/api/agent/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to navigate');
      }

      setCurrentUrl(url);
      setPageState(data.page);
      setIsConnected(true);
      showToast(`Connected & Observed: ${data.page.title || url}`);
    } catch (err: any) {
      alert(`Navigation failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!isConnected) return;
    setIsLoading(true);
    try {
      showToast('Observing live DOM...');
      const res = await fetch('/api/agent/observe');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to observe');
      setPageState(data);
      showToast('Page state updated');
    } catch (err: any) {
      alert(`Refresh failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteAction = async (action: ObservedAction, text?: string) => {
    setIsLoading(true);
    try {
      showToast(`Executing action #${action.id} (${action.role || action.kind})...`);
      const res = await fetch('/api/agent/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionObj: action, text }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Action failed');
      }

      setPageState(data.page);
      if (data.page.url && data.page.url !== currentUrl) {
        setCurrentUrl(data.page.url);
      }
      showToast(`Action #${action.id} completed successfully`);
    } catch (err: any) {
      alert(`Action error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-layout">
      {/* Left Sidebar Menu */}
      <Sidebar
        activeModule={activeModule}
        onSelectModule={(mod) => setActiveModule(mod)}
        isConnected={isConnected}
        onLaunchBrowser={handleLaunchBrowser}
      />

      {/* Right Content View */}
      <main className="main-view">
        {activeModule === 'cdp-driver' ? (
          <CDPDriverView
            currentUrl={currentUrl}
            pageState={pageState}
            isLoading={isLoading}
            onNavigate={handleNavigate}
            onRefresh={handleRefresh}
            onExecuteAction={handleExecuteAction}
            onPageStateChange={(newState) => setPageState(newState)}
          />
        ) : (
          <NLBrowserView onShowToast={showToast} />
        )}
      </main>

      {toastMessage && <div className="toast">ℹ️ {toastMessage}</div>}
    </div>
  );
};
