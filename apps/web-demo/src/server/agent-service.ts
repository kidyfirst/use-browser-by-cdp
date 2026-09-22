/**
 * CDP Agent Server Service.
 * Exposes REST API endpoints to drive Chrome via @moni/cdp-driver and @moni/nl-browser.
 *
 * Model keys and endpoints are configured securely on the server via .env
 * (e.g. TYPESAFE_API_KEY, TEXT_MODEL_API_KEY, etc.) and are never passed from client requests.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Browser, type ObservedAction, type PageState } from '@moni/cdp-driver';
import { NLBrowser, type NLBrowserOptions } from '@moni/nl-browser';
import { handleIframeProxy } from './proxy-handler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-load .env files from apps/web-demo/.env or workspace root .env
function loadServerEnv(): void {
  const candidateEnvFiles = [
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../../.env'),
    path.resolve(process.cwd(), '.env'),
  ];

  for (const envFile of candidateEnvFiles) {
    if (fs.existsSync(envFile)) {
      try {
        if (typeof process.loadEnvFile === 'function') {
          process.loadEnvFile(envFile);
        } else {
          const content = fs.readFileSync(envFile, 'utf8');
          for (const line of content.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eqIdx = trimmed.indexOf('=');
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              const val = trimmed.slice(eqIdx + 1).trim().replace(/^["'](.*)["']$/, '$1');
              if (!(key in process.env)) {
                process.env[key] = val;
              }
            }
          }
        }
      } catch {
        // continue
      }
    }
  }
}
loadServerEnv();

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
          has_jev_key: Boolean(process.env['TYPESAFE_API_KEY']),
          has_text_key: Boolean(process.env['TEXT_MODEL_API_KEY'] || process.env['OPENAI_API_KEY']),
          text_model: process.env['TEXT_MODEL'] || 'deepseek-chat',
          text_base_url: process.env['TEXT_MODEL_BASE_URL'] || 'https://api.deepseek.com/v1',
          jev_model: process.env['TYPESAFE_MODEL'] || 'jev-latest',
          jev_base_url: process.env['TYPESAFE_BASE_URL'] || 'https://api.typesafe.ai/v1/systemone',
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
            const { targetUrl, goal, maxSteps } = body;
            if (!targetUrl || !goal) {
              throw new Error('Please provide targetUrl and goal');
            }

            if (activeNLAgent) {
              await activeNLAgent.close();
              activeNLAgent = null;
            }

            // Model keys and endpoints are configured exclusively in server environment (.env)
            const options: NLBrowserOptions = {
              maxSteps: typeof maxSteps === 'number' ? maxSteps : undefined,
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
