import React from 'react';

export type ActiveModule = 'cdp-driver' | 'nl-browser';

interface SidebarProps {
  activeModule: ActiveModule;
  onSelectModule: (module: ActiveModule) => void;
  isConnected: boolean;
  onLaunchBrowser?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  onSelectModule,
  isConnected,
  onLaunchBrowser,
}) => {
  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-header">
        <div className="brand">
          <span className="brand-icon">⚡</span>
          <div>
            <div className="brand-title">Moni Browser Suite</div>
            <div className="brand-subtitle">High-Precision CDP & AI Automation</div>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <div className="sidebar-menu">
        <div className="sidebar-section-title">核心模块切换</div>

        <button
          type="button"
          className={`nav-item ${activeModule === 'cdp-driver' ? 'active' : ''}`}
          onClick={() => onSelectModule('cdp-driver')}
        >
          <span className="nav-icon">🌐</span>
          <div className="nav-info">
            <div className="nav-title">@moni/cdp-driver</div>
            <div className="nav-desc">CDP 页面探测与底层交互控制</div>
          </div>
        </button>

        <button
          type="button"
          className={`nav-item ${activeModule === 'nl-browser' ? 'active' : ''}`}
          onClick={() => onSelectModule('nl-browser')}
        >
          <span className="nav-icon">🤖</span>
          <div className="nav-info">
            <div className="nav-title">@moni/nl-browser</div>
            <div className="nav-desc">自然语言自主操控 Agent (JEV + LLM)</div>
          </div>
        </button>
      </div>

      {/* Footer Info */}
      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Chrome CDP 连接</span>
          <div className={`status-badge ${isConnected ? 'connected' : 'disconnected'}`} style={{ padding: '2px 8px', fontSize: '11px' }}>
            <span className="status-dot" />
            <span>{isConnected ? '已连接' : '未连接'}</span>
          </div>
        </div>

        {!isConnected && onLaunchBrowser && (
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%', padding: '6px 10px', fontSize: '11px', marginTop: '6px' }}
            onClick={onLaunchBrowser}
          >
            🚀 一键启动调试 Chrome
          </button>
        )}

        <div style={{ fontSize: '10px', color: '#475569', textAlign: 'center' }}>
          use-browser-by-cdp v0.1.0 (Monorepo)
        </div>
      </div>
    </aside>
  );
};
