import React from 'react';
import type { ObservedAction, PageState } from '@moni/cdp-driver';
import { UrlInputBar } from './UrlInputBar';
import { FramePreview } from './FramePreview';
import { ElementList } from './ElementList';
import { JsonViewer } from './JsonViewer';

interface CDPDriverViewProps {
  currentUrl: string;
  pageState: PageState | null;
  isLoading: boolean;
  onNavigate: (url: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onExecuteAction: (action: ObservedAction, text?: string) => Promise<void>;
  onPageStateChange: (newState: PageState) => void;
}

export const CDPDriverView: React.FC<CDPDriverViewProps> = ({
  currentUrl,
  pageState,
  isLoading,
  onNavigate,
  onRefresh,
  onExecuteAction,
  onPageStateChange,
}) => {
  return (
    <>
      <div className="view-header">
        <div className="view-title-group">
          <h2>🌐 @moni/cdp-driver 页面底层探测与交互</h2>
          <p>原子快照、五重防遮挡前置守卫、确定性 SHA-256 指纹与物理事件交互</p>
        </div>
      </div>

      <div className="view-content">
        {/* URL Input Bar */}
        <UrlInputBar
          currentUrl={currentUrl}
          isLoading={isLoading}
          onNavigate={onNavigate}
          onRefresh={onRefresh}
        />

        {/* Main Grid: Frame Preview + Structured Elements */}
        <div className="preview-grid">
          <FramePreview
            url={currentUrl}
            title={pageState?.title}
            isLoading={isLoading}
          />

          <ElementList
            pageState={pageState}
            onExecuteAction={onExecuteAction}
            isLoading={isLoading}
          />

          <JsonViewer
            data={pageState}
            title="Extracted Page State & Elements Tree"
            onDataChange={onPageStateChange}
          />
        </div>
      </div>
    </>
  );
};
