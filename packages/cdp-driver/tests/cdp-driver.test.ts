/**
 * Unit tests for @moni/cdp-driver
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  Browser,
  StalePageError,
  browserOperation,
  fingerprint,
  resolveActionTarget,
  WebSocketCDPClient,
  type ObservedAction,
  type PageState,
  type CDPTransport,
} from '../src/index.js';

function createMockPage(): PageState {
  const actions: ObservedAction[] = [
    { id: 'e1', node: 1, kind: 'fill', label: 'Search', role: 'textbox', value: '' },
    { id: 'e2', node: 2, kind: 'click', label: 'Submit', role: 'button', value: '' },
    { id: 'wait', kind: 'wait', label: 'Wait', role: 'button' },
  ];
  const state: PageState = {
    url: 'https://example.com/',
    title: 'Test Page',
    text: 'Test Page Content',
    scroll: { y: 0, height: 1000 },
    actions,
    fingerprint: '',
  };
  state.fingerprint = fingerprint(state);
  return state;
}

describe('@moni/cdp-driver Core Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('computes deterministic fingerprint based on text, url, scroll, and actions', () => {
    const page = createMockPage();
    const copy = structuredClone(page);
    expect(fingerprint(page)).toBe(fingerprint(copy));

    // Screenshot change must not alter fingerprint
    copy.screenshot = 'base64-changed';
    expect(fingerprint(page)).toBe(fingerprint(copy));

    // Content change alters fingerprint
    copy.text = 'Modified Content';
    expect(fingerprint(page)).not.toBe(fingerprint(copy));
  });

  it('observation executes snapshot script atomically in browser', async () => {
    const mockPage = createMockPage();
    const mockCall = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: mockPage } };
      }
      if (method === 'Page.captureScreenshot') {
        return { data: 'mock-screenshot' };
      }
      return {};
    });

    const result = await browserOperation(
      { operation: 'observe', screenshot: true },
      mockCall
    );

    expect(result.url).toBe(mockPage.url);
    expect(result.actions).toHaveLength(3);
    expect(mockCall).toHaveBeenCalledWith('Runtime.evaluate', expect.anything());
    expect(mockCall).toHaveBeenCalledWith('Page.captureScreenshot', expect.anything());
  });

  it('handles navigation during evaluation by throwing StalePageError', async () => {
    const mockCall = vi.fn().mockResolvedValue({
      exceptionDetails: { text: 'Execution context was destroyed.' },
    });

    await expect(
      browserOperation({ operation: 'observe' }, mockCall)
    ).rejects.toThrow(StalePageError);
  });

  it('executes scroll action via mouseWheel', async () => {
    const mockCall = vi.fn().mockResolvedValue({});
    const scrollAction: ObservedAction = {
      id: 'scroll_down',
      kind: 'scroll',
      label: 'Scroll down',
      role: 'button',
      delta: 500,
    };

    const res = await browserOperation(
      { operation: 'act', action: scrollAction },
      mockCall
    );

    expect(res).toEqual({ executed: 'scroll_down' });
    expect(mockCall).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: 550,
      y: 650,
      deltaX: 0,
      deltaY: 500,
    });
  });

  it('rejects action when target geometry is null or occluded', async () => {
    // Evaluates targetScript and returns null (e.g. occluded or covered)
    const mockCall = vi.fn().mockResolvedValue({ result: { value: null } });
    const action: ObservedAction = {
      id: 'e2',
      node: 2,
      kind: 'click',
      label: 'Submit',
      role: 'button',
    };

    await expect(
      browserOperation({ operation: 'act', action }, mockCall)
    ).rejects.toThrow(StalePageError);
  });

  it('executes click when target coordinates resolve successfully', async () => {
    const mockCall = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: { x: 100, y: 200 } } };
      }
      return {};
    });

    const action: ObservedAction = {
      id: 'e2',
      node: 2,
      kind: 'click',
      label: 'Submit',
      role: 'button',
    };

    const res = await browserOperation(
      { operation: 'act', action },
      mockCall
    );

    expect(res).toEqual({ executed: 'e2' });
    expect(mockCall).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });
    expect(mockCall).toHaveBeenCalledWith('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: 100,
      y: 200,
      button: 'left',
      clickCount: 1,
    });
  });

  it('executes text fill with key events and insertText', async () => {
    const mockCall = vi.fn().mockImplementation(async (method: string) => {
      if (method === 'Runtime.evaluate') {
        return { result: { value: { x: 50, y: 80 } } };
      }
      return {};
    });

    const action: ObservedAction = {
      id: 'e1',
      node: 1,
      kind: 'fill',
      label: 'Search',
      role: 'textbox',
    };

    await browserOperation(
      { operation: 'act', action, text: 'Hello World' },
      mockCall
    );

    expect(mockCall).toHaveBeenCalledWith('Input.insertText', { text: 'Hello World' });
  });

  it('Browser class methods coordinate transport correctly', async () => {
    const mockTransport: CDPTransport = {
      call: vi.fn().mockResolvedValue({}),
      evaluate: vi.fn().mockResolvedValue(true),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const browser = new Browser('https://example.com', mockTransport);
    browser.sessionId = 'test-session';

    await browser.call('Test.method', { foo: 'bar' });
    expect(mockTransport.call).toHaveBeenCalledWith('Test.method', { foo: 'bar' }, 'test-session');

    await browser.close();
    expect(mockTransport.close).toHaveBeenCalledTimes(1);
  });
});
