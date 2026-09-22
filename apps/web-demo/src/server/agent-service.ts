/**
 * CDP Agent Server Service.
 * Exposes REST API endpoints to drive Chrome via @moni/cdp-driver and @moni/nl-browser.
 */

import http from 'node:http';
import { Browser, type ObservedAction, type PageState } from '@moni/cdp-driver';
import { NLBrowser, type NLBrowserOptions } from '@moni/nl-browser';
import { handleIframeProxy } from './proxy-handler.js';

let activeBrowser: Browser | null = null;
let activeNLAgent: NLBrowser | null = null;
let isBusy = false;

export async function closeActiveBrowser(): Promise<void> {
  if (activeNLAgent) {
    await activeNLAgent.close();
    activeNLAgent = null;
  }
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
  if (activeNLAgent) {
    return activeNLAgent.state.page;
  }
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

  // 2. CDP Driver status check
  if (url.pathname === '/api/agent/status' && req.method === 'GET') {
    const currentUrl = activeNLAgent?.state.page.url || activeBrowser?.currentUrl || null;
    const targetId = activeNLAgent?.state.browser.targetId || activeBrowser?.targetId || null;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        connected: Boolean(activeBrowser || activeNLAgent),
        url: currentUrl,
        targetId,
      })
    );
    return;
  }

  // 3. Observe current page
  if (url.pathname === '/api/agent/observe' && req.method === 'GET') {
    const target = activeNLAgent?.state.browser || activeBrowser;
    if (!target) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Browser not connected' }));
      return;
    }

    target
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

  // 4. NL Agent endpoints (/api/nl/*)
  if (url.pathname.startsWith('/api/nl/')) {
    if (url.pathname === '/api/nl/state' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          active: Boolean(activeNLAgent),
          snapshot: activeNLAgent ? activeNLAgent.snapshot() : null,
          text_model: process.env['TEXT_MODEL'] || 'deepseek-chat',
          jev_model: process.env['TYPESAFE_MODEL'] || 'jev-latest',
        })
      );
      return;
    }

    if (req.method === 'POST') {
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
          const subAction = url.pathname.replace('/api/nl/', '');

          if (subAction === 'start') {
            const { targetUrl, goal, jev, textModel, maxSteps } = body;
            if (!targetUrl || !goal) {
              throw new Error('Please provide targetUrl and goal');
            }

            if (activeNLAgent) {
              await activeNLAgent.close();
              activeNLAgent = null;
            }

            const options: NLBrowserOptions = {
              jev,
              textModel,
              maxSteps,
              screenshots: true,
            };

            // Reuse activeBrowser if already connected to avoid reopening tab
            if (activeBrowser) {
              options.browser = activeBrowser;
            }

            activeNLAgent = await NLBrowser.create(targetUrl, goal, options);
            if (!activeBrowser) {
              activeBrowser = activeNLAgent.state.browser;
            }

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, snapshot: activeNLAgent.snapshot() }));
          } else if (subAction === 'step') {
            if (!activeNLAgent) {
              throw new Error('No active NL agent. Please start a task first.');
            }
            const command = body.command || 'tick';
            await activeNLAgent.command(command, body);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, snapshot: activeNLAgent.snapshot() }));
          } else if (subAction === 'run') {
            if (!activeNLAgent) {
              throw new Error('No active NL agent. Please start a task first.');
            }
            const result = await activeNLAgent.execute();
            res.setHeader('Content-Type', 'application/json');
            res.end(
              JSON.stringify({
                success: true,
                result,
                snapshot: activeNLAgent.snapshot(),
              })
            );
          } else if (subAction === 'stop') {
            if (activeNLAgent) {
              await activeNLAgent.close();
              activeNLAgent = null;
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Unknown NL action' }));
          }
        } catch (err: any) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: err.message || 'NL operation failed' }));
        } finally {
          isBusy = false;
        }
      });
      return;
    }
  }

  // 5. CDP Driver POST endpoints (navigate, act, close)
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
