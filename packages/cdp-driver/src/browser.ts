/**
 * Core Browser class for high-precision CDP automation.
 */

import { createHash } from 'node:crypto';
import { getChromeWsEndpoint, WebSocketCDPClient } from './client.js';
import { StalePageError } from './errors.js';
import { resolveActionTarget, waitForAutocomplete } from './injected/actions.js';
import { captureSnapshot } from './injected/snapshot.js';
import type { ActOptions, ActResult, ObservedAction } from './types/actions.js';
import type { CDPTransport } from './types/cdp.js';
import type { PageState } from './types/page.js';

export { captureSnapshot, resolveActionTarget, waitForAutocomplete };

export const SNAPSHOT_SCRIPT = `(${captureSnapshot.toString()})()`;
export const MARKER_SCRIPT = `(() => {
  const state = (${captureSnapshot.toString()})();
  return state?.marker ?? null;
})()`;

export function fingerprint(state: Pick<PageState, 'url' | 'text' | 'actions' | 'scroll'>): string {
  const content = {
    actions: state.actions,
    scroll: state.scroll,
    text: state.text,
    url: state.url,
  };
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

export interface BrowserOperationRequest {
  operation: 'observe' | 'act';
  session?: string;
  action?: ObservedAction;
  text?: string | null;
  screenshot?: boolean;
}

export async function browserOperation(
  request: BrowserOperationRequest,
  callFn: (method: string, params?: Record<string, unknown>) => Promise<any>
): Promise<any> {
  const operation = request.operation;

  async function evaluate(expression: string): Promise<any> {
    const result = await callFn('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      if (operation === 'act' && request.action?.kind === 'select') {
        throw new Error('Dropdown execution was interrupted; inspect before retrying.');
      }
      throw new StalePageError('Document changed during evaluation');
    }
    return result?.result?.value;
  }

  if (operation === 'act') {
    const action = request.action!;
    const kind = action.kind;

    if (kind === 'scroll') {
      await callFn('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: 550,
        y: 650,
        deltaX: 0,
        deltaY: action.delta ?? 0,
      });
    } else if (kind !== 'wait') {
      if (typeof action.node !== 'number') {
        throw new Error('Invalid observed node');
      }

      const targetScript = `(${resolveActionTarget.toString()})(${JSON.stringify(action)})`;
      const target = await evaluate(targetScript);

      if (target === null || target === undefined) {
        if (kind === 'select') {
          throw new Error('Dropdown execution was not confirmed; inspect before retrying.');
        }
        throw new StalePageError('Target changed or is covered. Observe again.');
      }

      if (kind !== 'select') {
        const { x, y } = target;
        for (const event of ['mousePressed', 'mouseReleased']) {
          await callFn('Input.dispatchMouseEvent', {
            type: event,
            x,
            y,
            button: 'left',
            clickCount: 1,
          });
        }

        if (kind === 'fill') {
          const isDarwin = process.platform === 'darwin';
          await callFn('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'a',
            code: 'KeyA',
            modifiers: isDarwin ? 4 : 2,
            commands: ['selectAll'],
          });
          await callFn('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'a',
            code: 'KeyA',
            modifiers: isDarwin ? 4 : 2,
          });
          await callFn('Input.insertText', { text: request.text ?? '' });
        }
      }
    }
    return { executed: action.id };
  }

  const info = await evaluate(SNAPSHOT_SCRIPT);
  if (!info) {
    throw new StalePageError('Document is navigating');
  }

  info.fingerprint = fingerprint(info);

  if (request.screenshot !== false) {
    try {
      const snap = await callFn('Page.captureScreenshot', { format: 'jpeg', quality: 72 });
      info.screenshot = snap.data;
    } catch {
      // ignore
    }
  }

  return info;
}

export class Browser {
  public targetId: string | null = null;
  public sessionId: string | null = null;
  public afterInput: ObservedAction | null = null;

  constructor(
    public currentUrl: string,
    public readonly transport: CDPTransport
  ) {}

  static async connect(url: string, cdpUrl?: string): Promise<Browser> {
    const wsEndpoint = await getChromeWsEndpoint(cdpUrl);
    const transport = new WebSocketCDPClient(wsEndpoint);
    await transport.connect();

    const browser = new Browser(url, transport);
    await browser.init();
    return browser;
  }

  async init(): Promise<void> {
    const target = await this.transport.call<{ targetId: string }>('Target.createTarget', {
      url: 'about:blank',
      background: true,
    });
    this.targetId = target.targetId;

    const attached = await this.transport.call<{ sessionId: string }>('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    });
    this.sessionId = attached.sessionId;

    await this.call('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });

    await this.call('Emulation.setFocusEmulationEnabled', { enabled: true });
    await this.navigate(this.currentUrl);
  }

  async navigate(url: string): Promise<void> {
    this.currentUrl = url;
    await this.call('Page.navigate', { url });

    const deadline = performance.now() + 15000;
    while (performance.now() < deadline) {
      const readyState = await this.evaluate('document.readyState');
      if (readyState === 'complete') break;
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.transport.call<T>(method, params, this.sessionId || undefined);
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    const response = await this.call<{
      result?: { value?: T };
      exceptionDetails?: unknown;
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (response?.exceptionDetails) {
      throw new StalePageError('Document changed during evaluation');
    }
    return response?.result?.value as T;
  }

  async observe(screenshot = true): Promise<PageState> {
    if (this.afterInput) {
      const action = this.afterInput;
      this.afterInput = null;
      try {
        await this.call('Runtime.evaluate', {
          expression: `(${waitForAutocomplete.toString()})(${JSON.stringify(action)})`,
          awaitPromise: true,
          returnByValue: true,
        });
      } catch {
        // ignore
      }
    }

    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        return (await browserOperation(
          {
            operation: 'observe',
            session: this.sessionId || undefined,
            screenshot,
          },
          (method, params) => this.call(method, params)
        )) as PageState;
      } catch (err) {
        if (err instanceof StalePageError) {
          if (attempt === 9) throw err;
          await new Promise((r) => setTimeout(r, 20));
          continue;
        }
        throw err;
      }
    }
    throw new StalePageError('Page did not settle');
  }

  async fresh(page: PageState, action?: ObservedAction | null): Promise<boolean> {
    if (action && (action.kind === 'click' || action.kind === 'select')) {
      const node = action.node;
      if (typeof node !== 'number') return false;
      const current = await this.evaluate<[unknown, unknown] | null>(
        `(() => { const c = window.__moniFast; return c ? [c.pageKey(), c.guard(c.nodes.get(${node}))] : null; })()`
      );
      const expectedGuard = page.guards ? page.guards[String(node)] : undefined;
      return JSON.stringify(current) === JSON.stringify([page.page_key, expectedGuard]);
    }
    const marker = await this.evaluate<unknown>(MARKER_SCRIPT);
    return JSON.stringify(marker) === JSON.stringify(page.marker);
  }

  async act(action: ObservedAction, options: ActOptions = {}): Promise<ActResult> {
    if (action.kind === 'wait') {
      await new Promise((r) => setTimeout(r, 100));
    }

    const result = (await browserOperation(
      {
        operation: 'act',
        session: this.sessionId || undefined,
        action,
        text: options.text,
      },
      (method, params) => this.call(method, params)
    )) as ActResult;

    this.afterInput = action.kind !== 'wait' ? action : null;
    return result;
  }

  async close(): Promise<void> {
    if (this.targetId) {
      try {
        await this.transport.call('Target.closeTarget', { targetId: this.targetId });
      } catch {
        // ignore
      }
      this.targetId = null;
    }
    await this.transport.close();
  }
}
