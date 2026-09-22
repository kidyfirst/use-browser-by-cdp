import React, { useState } from 'react';

interface JsonViewerProps {
  data: any;
  title?: string;
  onDataChange?: (newData: any) => void;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({
  data,
  title = 'Page State JSON',
  onDataChange,
}) => {
  const [viewMode, setViewMode] = useState<'tree' | 'raw'>('tree');
  const [searchTerm, setSearchTerm] = useState('');
  const [rawText, setRawText] = useState('');
  const [copied, setCopied] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync rawText whenever data or mode changes
  React.useEffect(() => {
    if (data !== undefined && data !== null) {
      setRawText(JSON.stringify(data, null, 2));
    } else {
      setRawText('');
    }
  }, [data]);

  const handleCopy = () => {
    if (!data) return;
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRawChange = (val: string) => {
    setRawText(val);
    try {
      const parsed = JSON.parse(val);
      setParseError(null);
      if (onDataChange) {
        onDataChange(parsed);
      }
    } catch (err: any) {
      setParseError(err.message);
    }
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `page-state-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="panel-card" style={{ gridColumn: '1 / -1' }}>
      <div className="panel-header">
        <div className="panel-title">
          <span>⚙️ {title}</span>
          <span className="panel-badge">
            {data ? `${Object.keys(data).length} root keys` : 'Empty'}
          </span>
        </div>

        <div className="json-actions">
          <button
            type="button"
            className="quick-link-btn"
            style={{
              backgroundColor: viewMode === 'tree' ? 'var(--accent-color)' : undefined,
              color: viewMode === 'tree' ? '#fff' : undefined,
            }}
            onClick={() => setViewMode('tree')}
          >
            Tree View
          </button>
          <button
            type="button"
            className="quick-link-btn"
            style={{
              backgroundColor: viewMode === 'raw' ? 'var(--accent-color)' : undefined,
              color: viewMode === 'raw' ? '#fff' : undefined,
            }}
            onClick={() => setViewMode('raw')}
          >
            Raw / Editor
          </button>
          <button type="button" className="quick-link-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button type="button" className="quick-link-btn" onClick={handleDownload}>
            Download
          </button>
        </div>
      </div>

      <div className="json-viewer-container">
        {viewMode === 'tree' && (
          <div className="json-toolbar">
            <input
              type="text"
              className="json-search-input"
              placeholder="Search keys/values..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        )}

        <div className="json-content">
          {!data ? (
            <div className="empty-state">
              <p>No JSON data to display.</p>
            </div>
          ) : viewMode === 'tree' ? (
            <JsonNode value={data} search={searchTerm} defaultOpen={true} depth={0} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {parseError && (
                <div
                  style={{
                    color: 'var(--danger-color)',
                    background: 'rgba(239, 68, 68, 0.1)',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    marginBottom: '8px',
                  }}
                >
                  Syntax Error: {parseError}
                </div>
              )}
              <textarea
                style={{
                  flex: 1,
                  background: 'transparent',
                  color: '#e2e8f0',
                  border: 'none',
                  outline: 'none',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13px',
                  resize: 'none',
                  lineHeight: '1.5',
                  width: '100%',
                  height: '420px',
                }}
                value={rawText}
                onChange={(e) => handleRawChange(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface JsonNodeProps {
  keyName?: string;
  value: any;
  search: string;
  defaultOpen?: boolean;
  depth: number;
}

const JsonNode: React.FC<JsonNodeProps> = ({
  keyName,
  value,
  search,
  defaultOpen = false,
  depth,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || depth < 1);

  if (value === null) {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }}>
        {keyName !== undefined && <span className="json-key">"{keyName}": </span>}
        <span className="json-null">null</span>
      </div>
    );
  }

  if (typeof value === 'boolean') {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }}>
        {keyName !== undefined && <span className="json-key">"{keyName}": </span>}
        <span className="json-boolean">{value.toString()}</span>
      </div>
    );
  }

  if (typeof value === 'number') {
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }}>
        {keyName !== undefined && <span className="json-key">"{keyName}": </span>}
        <span className="json-number">{value}</span>
      </div>
    );
  }

  if (typeof value === 'string') {
    const isMatched = search && value.toLowerCase().includes(search.toLowerCase());
    return (
      <div style={{ paddingLeft: `${depth * 16}px` }}>
        {keyName !== undefined && <span className="json-key">"{keyName}": </span>}
        <span
          className="json-string"
          style={isMatched ? { backgroundColor: 'rgba(250, 204, 21, 0.4)' } : undefined}
        >
          "{value.length > 300 ? value.slice(0, 300) + '...' : value}"
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const keys = Object.keys(value);

  return (
    <div style={{ paddingLeft: `${depth * 16}px` }}>
      <div>
        <span className="json-toggle" onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? '▼' : '▶'}
        </span>
        {keyName !== undefined && <span className="json-key">"{keyName}": </span>}
        <span style={{ color: 'var(--text-muted)' }}>
          {isArray ? `Array(${value.length})` : `Object{${keys.length}}`}
        </span>
      </div>

      {isOpen && (
        <div>
          {keys.map((k) => (
            <JsonNode
              key={k}
              keyName={isArray ? undefined : k}
              value={value[k]}
              search={search}
              defaultOpen={false}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};
