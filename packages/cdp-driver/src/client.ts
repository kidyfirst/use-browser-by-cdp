/**
 * High-performance WebSocket CDP client and Chrome endpoint discovery.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { CDPConnectionError, StalePageError } from './errors.js';
import type { CDPTransport } from './types/cdp.js';

export class WebSocketCDPClient implements CDPTransport {
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

  constructor(public readonly wsUrl: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(this.wsUrl);
      this.ws = socket;
      socket.on('open', () => resolve());
      socket.on('error', (err) => reject(new CDPConnectionError(`Failed to connect to ${this.wsUrl}: ${err.message}`)));
      socket.on('message', (data: WebSocket.RawData) => {
        try {
          const res = JSON.parse(data.toString());
          if (res.id && this.pending.has(res.id)) {
            const p = this.pending.get(res.id)!;
            this.pending.delete(res.id);
            if (res.error) {
              p.reject(new Error(res.error.message || JSON.stringify(res.error)));
            } else {
              p.resolve(res.result);
            }
          }
        } catch {
          // ignore unparseable events
        }
      });
    });
  }

  async call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    sessionId?: string
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: Record<string, unknown> = { id, method, params };
      if (sessionId) {
        msg['sessionId'] = sessionId;
      }
      this.ws!.send(JSON.stringify(msg));
    });
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
      throw new StalePageError('Document changed or context destroyed during evaluation');
    }
    return response?.result?.value as T;
  }

  async close(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * Automatically discovers active Chrome DevTools WebSocket endpoint.
 * Looks for DevToolsActivePort in user profile directories before falling back to HTTP probe.
 */
export async function getChromeWsEndpoint(customUrl?: string): Promise<string> {
  const rawUrl = customUrl || process.env['CHROME_WS_ENDPOINT'] || process.env['CHROME_CDP_URL'];
  if (rawUrl && (rawUrl.startsWith('ws://') || rawUrl.startsWith('wss://'))) {
    return rawUrl;
  }

  // 1. Try reading DevToolsActivePort from Chrome profile directories
  const activePortCandidates = [
    path.join(os.homedir(), 'Library/Application Support/Google/Chrome/DevToolsActivePort'),
    path.join(os.homedir(), '.config/google-chrome/DevToolsActivePort'),
    path.join(os.homedir(), '.config/chromium/DevToolsActivePort'),
    process.env['LOCALAPPDATA']
      ? path.join(process.env['LOCALAPPDATA'], 'Google/Chrome/User Data/DevToolsActivePort')
      : '',
  ].filter(Boolean);

  for (const portFile of activePortCandidates) {
    try {
      if (fs.existsSync(portFile)) {
        const lines = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
        const port = lines[0]?.trim();
        const devPath = lines[1]?.trim();
        if (port && devPath) {
          const formattedPath = devPath.startsWith('/') ? devPath : `/${devPath}`;
          return `ws://127.0.0.1:${port}${formattedPath}`;
        }
      }
    } catch {
      // continue
    }
  }

  // 2. Fallback to /json/version endpoint
  const httpBase = (rawUrl || 'http://127.0.0.1:9222').replace(/\/+$/, '');
  try {
    const versionRes = await fetch(`${httpBase}/json/version`);
    if (versionRes.ok) {
      const text = await versionRes.text();
      if (text) {
        const data = JSON.parse(text) as { webSocketDebuggerUrl?: string };
        if (data.webSocketDebuggerUrl) {
          return data.webSocketDebuggerUrl;
        }
      }
    }
  } catch {
    // ignore
  }

  throw new CDPConnectionError(
    'Could not connect to Chrome DevTools Protocol. Please ensure Chrome is running with remote debugging enabled (--remote-debugging-port=9222).'
  );
}
