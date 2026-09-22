import React, { useRef } from 'react';

interface FramePreviewProps {
  url: string;
  title?: string;
  isLoading: boolean;
}

export const FramePreview: React.FC<FramePreviewProps> = ({ url, title, isLoading }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleReload = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const proxySrc = url ? `/api/proxy?url=${encodeURIComponent(url)}` : '';

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <span>🖥️ Live Page Preview</span>
          {title && <span className="panel-badge">{title}</span>}
          {isLoading && <span className="panel-badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' }}>Loading...</span>}
        </div>
        {url && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="quick-link-btn"
              onClick={handleReload}
              title="Reload frame"
            >
              ↻ Reload
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="quick-link-btn"
              style={{ textDecoration: 'none' }}
            >
              ↗ Open
            </a>
          </div>
        )}
      </div>

      <div className="panel-body">
        {url ? (
          <iframe
            ref={iframeRef}
            src={proxySrc}
            title="Embedded Website"
            className="iframe-wrapper"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">🌐</div>
            <p>No URL connected yet.</p>
            <p style={{ fontSize: '13px' }}>
              Enter a website URL above or select a preset to start CDP observation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
