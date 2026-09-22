/**
 * Iframe Embedding Proxy Handler.
 * Fetches target pages and removes X-Frame-Options and frame-ancestors headers
 * so that any website can be embedded cleanly inside the demo iframe.
 */

import http from 'node:http';

export async function handleIframeProxy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  const targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) {
    res.statusCode = 400;
    res.end('Missing url parameter');
    return;
  }

  try {
    const upstreamRes = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const contentType = upstreamRes.headers.get('content-type') || 'text/html';
    res.setHeader('Content-Type', contentType);

    // Explicitly allow embedding
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');

    let html = await upstreamRes.text();

    // Inject base tag so relative links and assets resolve correctly to the origin website
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head><base href="${targetUrl}">`);
    } else if (html.includes('<html>')) {
      html = html.replace('<html>', `<html><head><base href="${targetUrl}"></head>`);
    }

    res.statusCode = upstreamRes.status;
    res.end(html);
  } catch (err: any) {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/html');
    res.end(`<html><body style="font-family:sans-serif;padding:20px;"><h3>Failed to load proxy</h3><p>${err.message}</p></body></html>`);
  }
}
