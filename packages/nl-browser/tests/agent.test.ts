import { describe, expect, it, vi } from 'vitest';
import type { Browser, PageState } from '@moni/cdp-driver';
import { NLBrowser } from '../src/agent.js';
import * as jevModule from '../src/models/jev.js';
import * as textModule from '../src/models/text-helper.js';

describe('@moni/nl-browser Agent Loop', () => {
  const initialPage: PageState = {
    url: 'https://example.com/search',
    title: 'Search Page',
    text: 'Welcome to search portal',
    scroll: { y: 0 },
    actions: [
      {
        id: 'e1',
        node: 1,
        kind: 'fill',
        role: 'textbox',
        label: 'Query Box',
        value: '',
      },
      {
        id: 'e2',
        node: 2,
        kind: 'click',
        role: 'button',
        label: 'Submit Search',
      },
      {
        id: 'wait',
        kind: 'wait',
        role: 'button',
        label: 'Wait for page update',
      },
    ],
    fingerprint: 'fp-step-1',
  };

  const mockBrowser: Partial<Browser> = {
    observe: vi.fn().mockResolvedValue(initialPage),
    fresh: vi.fn().mockResolvedValue(true),
    act: vi.fn().mockResolvedValue({ executed: 'e1' }),
    close: vi.fn().mockResolvedValue(undefined),
  };

  it('initializes agent and snapshot successfully', async () => {
    const agent = await NLBrowser.create(
      'https://example.com/search',
      'Search for AI Agent',
      {
        browser: mockBrowser as Browser,
        screenshots: false,
      }
    );

    expect(agent.state.status).toBe('ready');
    expect(agent.state.goal).toBe('Search for AI Agent');

    const snap = agent.snapshot();
    expect(snap.elements).toHaveLength(2); // node 1, 2
    expect(snap.status).toBe('ready');
  });

  it('runs predict and act with LLM text generation on fill', async () => {
    // 1. Mock JEV decision: TYPE_TEXT on target [1] (e1)
    vi.spyOn(jevModule, 'choose').mockResolvedValueOnce({
      choice: 'e1',
      operation: 'TYPE_TEXT',
      target: '1',
      confidence: 0.98,
      probabilities: { e1: 0.98 },
      operation_probabilities: { TYPE_TEXT: 0.98 },
      target_probabilities: { '1': 0.98 },
      target_confidence: 0.98,
      raw_answers: {} as any,
      model: 'jev-test',
      usage: {},
      latency_ms: 12,
    });

    // 2. Mock LLM text helper: returns "AI Agent"
    vi.spyOn(textModule, 'fieldText').mockResolvedValueOnce([
      'AI Agent',
      { model: 'deepseek-test', latency_ms: 100 },
    ]);

    const agent = await NLBrowser.create(
      'https://example.com/search',
      'Search for AI Agent',
      {
        browser: mockBrowser as Browser,
        screenshots: false,
      }
    );

    // Step 1: predict
    const decision = await agent.predict();
    expect(decision.operation).toBe('TYPE_TEXT');
    expect(decision.choice).toBe('e1');
    expect(agent.state.status).toBe('predicted');

    // Step 2: act
    const snap = await agent.act();
    expect(mockBrowser.act).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'e1', kind: 'fill' }),
      { text: 'AI Agent' }
    );
    expect(snap.history).toHaveLength(1);
    expect(snap.history[0]?.text).toBe('AI Agent');
    expect(snap.history[0]?.action).toBe('Query Box');
  });

  it('terminates cleanly when JEV chooses DONE', async () => {
    vi.spyOn(jevModule, 'choose').mockResolvedValueOnce({
      choice: 'DONE',
      operation: 'DONE',
      target: null,
      confidence: 0.99,
      probabilities: { DONE: 0.99 },
      operation_probabilities: { DONE: 0.99 },
      target_probabilities: {},
      target_confidence: null,
      raw_answers: {} as any,
      model: 'jev-test',
      usage: {},
      latency_ms: 10,
    });

    const agent = await NLBrowser.create(
      'https://example.com/search',
      'Search complete task',
      {
        browser: mockBrowser as Browser,
        screenshots: false,
      }
    );

    await agent.predict();
    await agent.act();

    expect(agent.state.status).toBe('done');
    const result = agent.toResult();
    expect(result.status).toBe('done');
  });
});
