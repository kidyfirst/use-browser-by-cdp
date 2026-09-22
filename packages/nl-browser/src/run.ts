/**
 * One-shot task runner for @moni/nl-browser.
 */

import { NLBrowser } from './agent.js';
import type { RunTaskOptions, TaskResult } from './types.js';

export async function runTask(options: RunTaskOptions): Promise<TaskResult> {
  const agent = await NLBrowser.create(options.startUrl, options.goal, options);
  try {
    return await agent.execute();
  } finally {
    await agent.close();
  }
}
