import React, { useState, useMemo } from 'react';
import type { ObservedAction, PageState } from '@moni/cdp-driver';

interface ElementListProps {
  pageState: PageState | null;
  onExecuteAction: (action: ObservedAction, text?: string) => Promise<void>;
  isLoading: boolean;
}

export const ElementList: React.FC<ElementListProps> = ({
  pageState,
  onExecuteAction,
  isLoading,
}) => {
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inputTextMap, setInputTextMap] = useState<Record<string, string>>({});

  const actions = pageState?.actions || [];

  const filteredActions = useMemo(() => {
    return actions.filter((act) => {
      const matchesType =
        filterType === 'all' ||
        (filterType === 'click' && act.kind === 'click') ||
        (filterType === 'fill' && act.kind === 'fill') ||
        (filterType === 'select' && act.kind === 'select') ||
        (filterType === 'button' && act.role === 'button') ||
        (filterType === 'link' && act.role === 'link');

      if (!matchesType) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        act.id.toLowerCase().includes(q) ||
        (act.role && act.role.toLowerCase().includes(q)) ||
        (act.label && act.label.toLowerCase().includes(q)) ||
        (act.value && act.value.toLowerCase().includes(q))
      );
    });
  }, [actions, filterType, searchQuery]);

  const getBadgeClass = (role?: string, kind?: string) => {
    if (role === 'button') return 'elem-badge button';
    if (role === 'link') return 'elem-badge link';
    if (kind === 'fill') return 'elem-badge input';
    if (role === 'combobox' || kind === 'select') return 'elem-badge select';
    return 'elem-badge default';
  };

  const handleActionClick = async (action: ObservedAction) => {
    if (action.kind === 'fill') {
      const text = inputTextMap[action.id] ?? 'Test input';
      await onExecuteAction(action, text);
    } else {
      await onExecuteAction(action);
    }
  };

  return (
    <div className="panel-card">
      <div className="panel-header">
        <div className="panel-title">
          <span>📋 Structured Elements List</span>
          <span className="panel-badge">{filteredActions.length} / {actions.length} elements</span>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="text"
            className="json-search-input"
            placeholder="Search elements..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <select
            className="json-search-input"
            style={{ width: 'auto' }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="click">Clickable</option>
            <option value="fill">Fillable (Inputs)</option>
            <option value="button">Buttons</option>
            <option value="link">Links</option>
          </select>
        </div>
      </div>

      <div className="panel-body">
        {actions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>No interactive elements detected yet.</p>
            <p style={{ fontSize: '13px' }}>Connect to a webpage to inspect its structured elements.</p>
          </div>
        ) : (
          <div className="elements-table-wrapper">
            <table className="elements-table">
              <thead>
                <tr>
                  <th style={{ width: '50px' }}>#ID</th>
                  <th style={{ width: '90px' }}>Role / Kind</th>
                  <th>Label / Text</th>
                  <th style={{ width: '130px' }}>Coordinates</th>
                  <th style={{ width: '130px' }}>CDP Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredActions.map((act) => (
                  <tr key={act.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{act.id}</td>
                    <td>
                      <span className={getBadgeClass(act.role, act.kind)}>
                        {act.role || act.kind}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{act.label || '<no text>'}</div>
                      {act.value && (
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          val: {act.value}
                        </div>
                      )}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#64748b' }}>
                      {act.rect ? `${Math.round(act.rect.x)},${Math.round(act.rect.y)} (${Math.round(act.rect.w)}x${Math.round(act.rect.h)})` : '-'}
                    </td>
                    <td>
                      {act.kind === 'fill' ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="text"
                            placeholder="text..."
                            style={{
                              width: '70px',
                              padding: '2px 4px',
                              fontSize: '11px',
                              background: '#090d16',
                              border: '1px solid var(--border-color)',
                              color: '#fff',
                              borderRadius: '4px',
                            }}
                            value={inputTextMap[act.id] ?? ''}
                            onChange={(e) =>
                              setInputTextMap((prev) => ({ ...prev, [act.id]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            className="action-btn-sm"
                            disabled={isLoading}
                            onClick={() => handleActionClick(act)}
                          >
                            Type
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="action-btn-sm"
                          disabled={isLoading}
                          onClick={() => handleActionClick(act)}
                        >
                          Click
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
