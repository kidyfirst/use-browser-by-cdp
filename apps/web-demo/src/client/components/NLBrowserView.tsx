import React, { useState, useEffect } from 'react';
import type { AgentHistoryItem, AgentSnapshot } from '@moni/nl-browser';
import { FramePreview } from './FramePreview';

interface NLBrowserViewProps {
  onShowToast: (msg: string) => void;
}

const PRESET_TASKS = [
  {
    label: 'Example.com 点击',
    url: 'https://example.com',
    goal: '点击页面上的 "Learn more" 链接进入详情页面',
  },
  {
    label: 'Hacker News 搜索',
    url: 'https://news.ycombinator.com',
    goal: '在搜索框输入 "AI Agent" 并提交搜索',
  },
  {
    label: 'GitHub Trending 探索',
    url: 'https://github.com/trending',
    goal: '查看今日榜单第一名的项目并点击进入',
  },
  {
    label: 'Google 航班机票',
    url: 'https://www.google.com/travel/flights?hl=zh-CN',
    goal: '搜索从北京飞往上海的航班',
  },
];

export const NLBrowserView: React.FC<NLBrowserViewProps> = ({ onShowToast }) => {
  const [url, setUrl] = useState<string>('https://example.com');
  const [goal, setGoal] = useState<string>('点击页面上的 "Learn more" 链接进入详情页面');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [snapshot, setSnapshot] = useState<AgentSnapshot | null>(null);
  const [modelsInfo, setModelsInfo] = useState<{
    text_model?: string;
    jev_model?: string;
    has_jev_key?: boolean;
    has_text_key?: boolean;
  }>({});

  // Poll current agent state and server environment status on mount
  useEffect(() => {
    fetch('/api/nl/state')
      .then((res) => res.json())
      .then((data) => {
        if (data.snapshot) {
          setSnapshot(data.snapshot);
          if (data.snapshot.page?.url) {
            setUrl(data.snapshot.page.url);
          }
          if (data.snapshot.goal) {
            setGoal(data.snapshot.goal);
          }
        }
        setModelsInfo({
          text_model: data.text_model,
          jev_model: data.jev_model,
          has_jev_key: data.has_jev_key,
          has_text_key: data.has_text_key,
        });
      })
      .catch(() => {});
  }, []);

  const handleStartAgent = async () => {
    if (!url.trim() || !goal.trim()) {
      alert('请输入目标网址和自然语言任务目标');
      return;
    }

    setIsLoading(true);
    try {
      onShowToast('正在初始化 Agent 并连接浏览器...');
      const res = await fetch('/api/nl/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrl: url.trim(), goal: goal.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '启动失败');
      }
      setSnapshot(data.snapshot);
      onShowToast(`Agent 就绪！当前状态: ${data.snapshot.status}`);
    } catch (err: any) {
      alert(`启动失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStep = async (command: 'tick' | 'predict' | 'act') => {
    setIsLoading(true);
    try {
      const actionName = command === 'predict' ? 'JEV 决策' : command === 'act' ? '执行操作' : '单步 Tick';
      onShowToast(`正在执行 ${actionName}...`);

      const res = await fetch('/api/nl/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '执行步骤失败');
      }
      setSnapshot(data.snapshot);
      if (data.snapshot.page?.url) {
        setUrl(data.snapshot.page.url);
      }
      onShowToast(`${actionName} 完成！状态: ${data.snapshot.status}`);
    } catch (err: any) {
      alert(`操作失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAutoRun = async () => {
    if (!snapshot) {
      await handleStartAgent();
    }
    setIsLoading(true);
    try {
      onShowToast('正在自主全自动运行至任务结束...');
      const res = await fetch('/api/nl/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '自动执行失败');
      }
      setSnapshot(data.snapshot);
      if (data.snapshot.page?.url) {
        setUrl(data.snapshot.page.url);
      }
      onShowToast(`任务执行完成！状态: ${data.result.status} (共 ${data.result.steps} 步)`);
    } catch (err: any) {
      alert(`执行失败: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/nl/stop', { method: 'POST' });
      setSnapshot(null);
      onShowToast('Agent 会话已重置');
    } catch (err: any) {
      alert(`停止失败: ${err.message}`);
    }
  };

  const status = snapshot?.status || 'idle';
  const history: AgentHistoryItem[] = snapshot?.history || [];

  return (
    <>
      <div className="view-header">
        <div className="view-title-group">
          <h2>🤖 @moni/nl-browser 自然语言 Agent (JEV UI 决策 + LLM 文本推理)</h2>
          <p>
            双引擎协作：JEV 决策操作与控件，LLM 仅在需要输入时填写内容（模型密钥从服务器端 .env 安全加载）
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            JEV: <strong style={{ color: '#93c5fd' }}>{modelsInfo.jev_model || 'jev-latest'}</strong>{' '}
            <span style={{ color: modelsInfo.has_jev_key ? '#34d399' : '#f87171' }}>
              ({modelsInfo.has_jev_key ? '✓已配置' : '✗缺少Key'})
            </span>
            {' '}| LLM:{' '}
            <strong style={{ color: '#fbbf24' }}>{modelsInfo.text_model || 'deepseek-chat'}</strong>{' '}
            <span style={{ color: modelsInfo.has_text_key ? '#34d399' : '#f87171' }}>
              ({modelsInfo.has_text_key ? '✓已配置' : '✗缺少Key'})
            </span>
          </span>
          <div className={`status-badge ${status}`}>
            <span className="status-dot" />
            <span style={{ textTransform: 'capitalize' }}>
              {isLoading ? 'Processing' : status}
            </span>
          </div>
        </div>
      </div>

      <div className="view-content">
        {/* Missing Server Key Warning Banner */}
        {(!modelsInfo.has_jev_key || !modelsInfo.has_text_key) && (
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-md)',
              padding: '10px 16px',
              fontSize: '12px',
              color: '#fbbf24',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>⚠️</span>
            <span>
              服务器未检测到完整模型密钥。请在项目根目录或 <code>apps/web-demo</code> 目录下配置{' '}
              <code>.env</code> 文件（可复制 <code>.env.example</code>），设置{' '}
              <code>TYPESAFE_API_KEY</code> 与 <code>TEXT_MODEL_API_KEY</code>。
            </span>
          </div>
        )}

        {/* Task Input Card */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '70px' }}>
              目标网址:
            </span>
            <input
              type="text"
              className="url-input"
              style={{ padding: '8px 12px' }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              disabled={isLoading}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', minWidth: '70px', paddingTop: '8px' }}>
              任务目标:
            </span>
            <textarea
              className="goal-textarea"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="输入一句话任务目标（例如：在搜索框输入关键词并回车）..."
              disabled={isLoading}
            />
          </div>

          {/* Quick Presets */}
          <div className="quick-links">
            <span>预设任务:</span>
            {PRESET_TASKS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="quick-link-btn"
                onClick={() => {
                  setUrl(preset.url);
                  setGoal(preset.goal);
                }}
                disabled={isLoading}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Action Toolbar */}
          <div className="agent-controls-bar" style={{ marginTop: '6px' }}>
            {!snapshot ? (
              <button
                type="button"
                className="btn btn-purple"
                onClick={handleStartAgent}
                disabled={isLoading}
              >
                🚀 启动 Agent 任务
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-purple"
                  onClick={handleAutoRun}
                  disabled={isLoading || status === 'done' || status === 'blocked'}
                >
                  ▶️ 全自动运行 (Auto)
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleStep('tick')}
                  disabled={isLoading || status === 'done' || status === 'blocked'}
                >
                  ⏭️ 单步 Tick
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleStep('predict')}
                  disabled={isLoading || status === 'predicted' || status === 'done' || status === 'blocked'}
                  title="JEV 模型预测下一步操作"
                >
                  🧠 JEV 预测
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => handleStep('act')}
                  disabled={isLoading || status !== 'predicted'}
                  title="LLM 生成文本并由 CDP 执行"
                >
                  ⚡ 执行 Act
                </button>

                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleStop}
                  disabled={isLoading}
                >
                  ⏹️ 重置 / 停止
                </button>
              </>
            )}

            {snapshot && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                已执行: <strong>{history.length}</strong> 步 | 耗时:{' '}
                <strong>{(snapshot.elapsed_ms / 1000).toFixed(1)}s</strong>
              </span>
            )}
          </div>
        </div>

        {/* Main Split Grid: Live Frame Preview + Step History Timeline */}
        <div className="preview-grid">
          {/* Left: Frame Preview */}
          <FramePreview
            url={url}
            title={snapshot?.page?.title}
            isLoading={isLoading}
          />

          {/* Right: Step History Timeline */}
          <div className="panel-card">
            <div className="panel-header">
              <div className="panel-title">
                <span>⏱️ Agent 决策与操作时序</span>
                <span className="panel-badge">{history.length} 步记录</span>
              </div>
              {snapshot?.decision && (
                <span style={{ fontSize: '11px', color: '#60a5fa' }}>
                  待执行: {snapshot.decision.operation} [{snapshot.decision.target}]
                </span>
              )}
            </div>

            <div className="panel-body">
              {history.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🤖</div>
                  <p>Agent 尚未开始执行操作。</p>
                  <p style={{ fontSize: '13px' }}>
                    点击上方 "启动 Agent 任务" 或 "全自动运行" 开始让 AI 操作浏览器。
                  </p>
                </div>
              ) : (
                <div className="timeline-container">
                  {history.map((item, idx) => (
                    <div key={idx} className="timeline-item">
                      <div className="timeline-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-muted)' }}>
                            #{item.step}
                          </span>
                          <span className={`op-badge ${item.operation}`}>{item.operation}</span>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{item.action}</span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {item.latency_ms}ms | 置信度 {(item.confidence * 100).toFixed(0)}%
                        </span>
                      </div>

                      {item.text !== null && (
                        <div className="timeline-text-val">
                          ✍️ 输入文本: <strong>"{item.text}"</strong>
                          {item.text_helper && (
                            <span style={{ color: 'var(--text-muted)', marginLeft: '8px', fontSize: '11px' }}>
                              (模型: {item.text_helper} | {item.text_latency_ms}ms)
                            </span>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
                        <span>URL: {item.url}</span>
                        <span>
                          {item.page_changed === true
                            ? '🟢 页面状态已更新'
                            : item.page_changed === false
                            ? '⚪ 页面无变化'
                            : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
