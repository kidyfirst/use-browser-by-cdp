/**
 * Robust HTTP client with exponential backoff for model API calls.
 */

import { ModelUnavailableError } from '../errors.js';

export async function postJson<T>(
  url: string,
  key: string,
  body: unknown,
  timeoutMs = 30000
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (attempt < 2 && err.name !== 'AbortError') {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
        continue;
      }
      throw new ModelUnavailableError(`Model request to ${url} failed: ${err.message}`);
    } finally {
      clearTimeout(timeoutTimer);
    }

    if ([429, 529, 503].includes(response.status) && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      continue;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new ModelUnavailableError(
        `Model provider returned HTTP ${response.status}: ${errText || response.statusText}`
      );
    }

    return (await response.json()) as T;
  }
  throw new ModelUnavailableError('Model service unavailable after 3 attempts');
}
