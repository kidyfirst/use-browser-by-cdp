import React, { useState, useEffect, useCallback } from 'react';
import type { PageState, ObservedAction } from '@moni/cdp-driver';
import { UrlInputBar } from './components/UrlInputBar';
import { FramePreview } from './components/FramePreview';
import { ElementList } from './components/ElementList';
import { JsonViewer } from './components/JsonViewer';

export const App: React.FC = () => {
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
      showToast(`Successfully connected and observed: ${data.page.title || url}`);
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

  const handleDisconnect = async () => {
    try {
      await fetch('/api/agent/close', { method: 'POST' });
      setIsConnected(false);
      setPageState(null);
      setCurrentUrl('');
      showToast('Browser disconnected');
    } catch (err: any) {
      alert(`Disconnect error: ${err.message}`);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <div>
            <div className="brand-title">CDP Browser Driver & Agent</div>
            <div className="brand-subtitle">@moni/cdp-driver High-Precision Browser Automation</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className={`status-badge ${
              isLoading ? 'loading' : isConnected ? 'connected' : 'disconnected'
            }`}
          >
            <span className="status-dot" />
            <span>
              {isLoading ? 'Processing' : isConnected ? 'CDP Active' : 'Disconnected'}
            </span>
          </div>

          {isConnected && (
            <button
              type="button"
              className="quick-link-btn"
              style={{ color: 'var(--danger-color)' }}
              onClick={handleDisconnect}
            >
              Disconnect
            </button>
          )}
        </div>
      </header>

      {/* URL Input Bar */}
      <UrlInputBar
        currentUrl={currentUrl}
        isLoading={isLoading}
        onNavigate={handleNavigate}
        onRefresh={handleRefresh}
      />

      {/* Main Content Area */}
      <div className="preview-grid">
        {/* Left: Frame Preview */}
        <FramePreview
          url={currentUrl}
          title={pageState?.title}
          isLoading={isLoading}
        />

        {/* Right: Structured Elements List */}
        <ElementList
          pageState={pageState}
          onExecuteAction={handleExecuteAction}
          isLoading={isLoading}
        />

        {/* Bottom Full-Width: JSON Tree & Raw Editor */}
        <JsonViewer
          data={pageState}
          title="Extracted Page State & Elements Tree"
          onDataChange={(newData) => setPageState(newData)}
        />
      </div>

      {toastMessage && <div className="toast">ℹ️ {toastMessage}</div>}
    </div>
  );
};
