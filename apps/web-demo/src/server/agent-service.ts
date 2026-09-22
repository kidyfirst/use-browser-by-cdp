/**
 * CDP Agent Server Service.
 * Exposes REST API endpoints to drive Chrome via @moni/cdp-driver.
 */

import http from 'node:http';
import { Browser, type ObservedAction, type PageState } from '@moni/cdp-driver';
import { handleIframeProxy } from './proxy-handler.js';

let activeBrowser: Browser | null = null;
let isBusy = false;

export async function closeActiveBrowser(): Promise<void> {
  if (activeBrowser) {
    await activeBrowser.close();
    activeBrowser = null;
  }
}

export async function navigateToUrl(url: string): Promise<PageState> {
  if (activeBrowser) {
    await activeBrowser.navigate(url);
  } else {
    activeBrowser = await Browser.connect(url);
  }
  return await activeBrowser.observe();
}

export async function getCurrentPage(): Promise<PageState | null> {
  if (!activeBrowser) return null;
  return await activeBrowser.observe();
}

export async function executeAction(action: ObservedAction, text?: string | null): Promise<PageState> {
  if (!activeBrowser) {
    throw new Error('No active browser connection. Please connect to a URL first.');
  }
  await activeBrowser.act(action, { text });
  return await activeBrowser.observe();
}

export function cdpAgentMiddleware(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: () => void
): void {
  const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);

  // 1. Iframe embedding proxy endpoint
  if (url.pathname === '/api/proxy') {
    handleIframeProxy(req, res);
    return;
  }

  // 2. Status check
  if (url.pathname === '/api/agent/status' && req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        connected: Boolean(activeBrowser),
        url: activeBrowser ? activeBrowser.currentUrl : null,
        targetId: activeBrowser ? activeBrowser.targetId : null,
      })
    );
    return;
  }

  // 3. Observe current page
  if (url.pathname === '/api/agent/observe' && req.method === 'GET') {
    if (!activeBrowser) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Browser not connected' }));
      return;
    }

    activeBrowser
      .observe()
      .then((page) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(page));
      })
      .catch((err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      });
    return;
  }

  // 4. POST endpoints (navigate, act, close)
  if (url.pathname.startsWith('/api/agent/') && req.method === 'POST') {
    if (isBusy) {
      res.statusCode = 409;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Another browser action is currently executing' }));
      return;
    }

    isBusy = true;
    let bodyText = '';
    req.on('data', (chunk) => {
      bodyText += chunk;
    });

    req.on('end', async () => {
      try {
        const body = bodyText ? JSON.parse(bodyText) : {};
        const action = url.pathname.replace('/api/agent/', '');

        if (action === 'navigate') {
          const targetUrl = body.url;
          if (!targetUrl) throw new Error('Missing URL parameter');
          const page = await navigateToUrl(targetUrl);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, page }));
        } else if (action === 'act') {
          const { actionObj, text } = body;
          if (!actionObj) throw new Error('Missing action object');
          const page = await executeAction(actionObj, text);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, page }));
        } else if (action === 'close') {
          await closeActiveBrowser();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
        } else {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Unknown agent action' }));
        }
      } catch (err: any) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message || 'Operation failed' }));
      } finally {
        isBusy = false;
      }
    });
    return;
  }

  next();
}
