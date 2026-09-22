import React, { useState } from 'react';

interface UrlInputBarProps {
  currentUrl: string;
  isLoading: boolean;
  onNavigate: (url: string) => void;
  onRefresh: () => void;
}

const PRESET_URLS = [
  { label: 'Hacker News', url: 'https://news.ycombinator.com' },
  { label: 'Example Domain', url: 'https://example.com' },
  { label: 'GitHub Trending', url: 'https://github.com/trending' },
  { label: 'HttpBin Form', url: 'https://httpbin.org/forms/post' },
];

export const UrlInputBar: React.FC<UrlInputBarProps> = ({
  currentUrl,
  isLoading,
  onNavigate,
  onRefresh,
}) => {
  const [inputUrl, setInputUrl] = useState(currentUrl || 'https://news.ycombinator.com');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    let target = inputUrl.trim();
    if (!/^https?:\/\//i.test(target)) {
      target = `https://${target}`;
      setInputUrl(target);
    }
    onNavigate(target);
  };

  return (
    <div className="url-bar-card">
      <form onSubmit={handleSubmit} className="url-input-form">
        <input
          type="text"
          className="url-input"
          placeholder="Enter website URL (e.g. https://news.ycombinator.com)..."
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          disabled={isLoading}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading || !inputUrl.trim()}
        >
          {isLoading ? (
            <>
              <span className="status-dot" /> Connecting...
            </>
          ) : (
            'Connect & Observe'
          )}
        </button>
        {currentUrl && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={isLoading}
            title="Re-observe page state"
          >
            ↻ Refresh
          </button>
        )}
      </form>

      <div className="quick-links">
        <span>Quick Presets:</span>
        {PRESET_URLS.map((preset) => (
          <button
            key={preset.url}
            type="button"
            className="quick-link-btn"
            onClick={() => {
              setInputUrl(preset.url);
              onNavigate(preset.url);
            }}
            disabled={isLoading}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
};
