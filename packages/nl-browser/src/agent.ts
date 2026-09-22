/**
 * Complete NLBrowser agent orchestrating JEV UI decisions, LLM text generation, and CDP physical execution.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Browser, StalePageError } from '@moni/cdp-driver';
import { actionSpace } from './action-space.js';
import { AgentTimeoutError } from './errors.js';
import { choose } from './models/jev.js';
import { fieldContext, fieldText } from './models/text-helper.js';
import { MAX_STEPS } from './questions.js';
import type {
  AgentCommandName,
  AgentHistoryItem,
  AgentSnapshot,
  AgentStatus,
  DecisionResult,
  FieldContext,
  NLBrowserOptions,
  PageState,
  TaskResult,
  TextHelperResult,
} from './types.js';

export interface InternalAgentState {
  browser: Browser;
  goal: string;
  page: PageState;
  decision: DecisionResult | null;
  history: AgentHistoryItem[];
  status: AgentStatus;
  plan: string[];
  plan_index: number;
  decisions: DecisionResult[];
  text_calls: Array<TextHelperResult & { field: string; value: string }>;
  elapsed_ms: number;
  started_at: number | null;
  record: boolean;
}

export class NLBrowser {
  public pendingText: [FieldContext, string, TextHelperResult] | null = null;
  public recordDir: string | null = null;
  public screenshots = true;
  public maxSteps: number;
  public state!: InternalAgentState;

  constructor(
    public readonly url: string,
    goals: string | string[],
    public readonly options: NLBrowserOptions = {}
  ) {
    const task = Array.isArray(goals) ? goals.join('\n').trim() : goals.trim();
    if (!task) {
      throw new Error('Supply a goal or task instruction');
    }
    this.recordDir = options.recordDir ? path.resolve(options.recordDir) : null;
    this.screenshots = options.screenshots ?? true;
    this.maxSteps = options.maxSteps ?? MAX_STEPS;
  }

  static async create(
    url: string,
    goals: string | string[],
    options: NLBrowserOptions = {}
  ): Promise<NLBrowser> {
    const agent = new NLBrowser(url, goals, options);
    const browser = options.browser ?? (await Browser.connect(url, options.cdpUrl));
    const task = Array.isArray(goals) ? goals.join('\n').trim() : goals.trim();
    const plan = [task];

    let page: PageState;
    try {
      page = await browser.observe(agent.screenshots);
    } catch (err) {
      if (!options.browser) {
        await browser.close();
      }
      throw err;
    }

    agent.state = {
      browser,
      goal: plan.join('\n'),
      page,
      decision: null,
      history: [],
      status: 'ready',
      plan,
      plan_index: 0,
      decisions: [],
      text_calls: [],
      elapsed_ms: 0,
      started_at: null,
      record: Boolean(agent.recordDir),
    };

    if (agent.recordDir && page.screenshot) {
      await fs.mkdir(agent.recordDir, { recursive: true });
      await fs.writeFile(
        path.join(agent.recordDir, '000000.jpg'),
        Buffer.from(page.screenshot, 'base64')
      );
    }

    return agent;
  }

  snapshot(): AgentSnapshot {
    const { browser: _b, ...rest } = this.state;
    return {
      ...rest,
      elements: actionSpace(this.state.page.actions).elements,
    };
  }

  async command(name: AgentCommandName, body: Record<string, any> = {}): Promise<AgentSnapshot> {
    const state = this.state;

    if (name === 'tick') {
      try {
        await this.command('predict', {});
        return await this.command('act', { fingerprint: state.page.fingerprint });
      } catch (err) {
        if (err instanceof StalePageError) {
          state.decision = null;
          state.status = 'ready';
          state.page = await state.browser.observe(this.screenshots);
          state.elapsed_ms = state.started_at ? Math.round(performance.now() - state.started_at) : 0;
          return this.snapshot();
        }
        throw err;
      }
    } else if (name === 'predict') {
      if (!state.browser) {
        throw new Error('Browser not connected');
      }
      if (state.started_at === null) {
        state.started_at = performance.now();
      }

      const isFresh = await state.browser.fresh(state.page);
      if (!isFresh) {
        state.page = await state.browser.observe(this.screenshots);
      }

      state.decision = null;
      if (state.status === 'done' || state.status === 'blocked') {
        throw new Error('This run has finished. Create a new agent for new tasks.');
      }
      if (state.decisions.length >= this.maxSteps * 2) {
        throw new AgentTimeoutError(`Reached maximum model decision budget (${this.maxSteps * 2})`);
      }

      state.decision = await choose(
        state.page,
        state.goal,
        state.history,
        this.options.jev
      );

      state.decisions.push({
        ...state.decision,
        fingerprint: state.page.fingerprint,
        elapsed_ms: Math.round(performance.now() - state.started_at),
      });
      state.status = 'predicted';
    } else if (name === 'act') {
      const decision = state.decision;
      const page = state.page;

      if (!decision || body['fingerprint'] !== page.fingerprint) {
        throw new Error('Observe and choose before acting');
      }

      state.decision = null;
      const selected = decision.choice;

      if (selected === 'DONE' || selected === 'BLOCKED') {
        const isFresh = await state.browser.fresh(page);
        if (!isFresh) {
          state.status = 'ready';
          throw new StalePageError('Page changed since decision. Choose again.');
        }
        state.status = selected === 'DONE' ? 'done' : 'blocked';
        state.plan_index = selected === 'DONE' ? 1 : 0;
        state.elapsed_ms = state.started_at ? Math.round(performance.now() - state.started_at) : 0;
        return this.snapshot();
      }

      const action = page.actions.find((a) => a.id === selected);
      if (!action) {
        throw new Error(`Action ${selected} not found in page actions`);
      }

      if (state.history.length >= this.maxSteps) {
        state.status = 'blocked';
        throw new AgentTimeoutError(`Stopped at the ${this.maxSteps}-action budget`);
      }

      let text: string | null = null;
      let helper: TextHelperResult | null = null;

      if (action.kind === 'fill') {
        const isFresh = await state.browser.fresh(page);
        if (!isFresh) {
          throw new StalePageError('Page changed before text generation. Choose again.');
        }

        const context = fieldContext(state.goal, action, page, state.history);
        if (this.pendingText && JSON.stringify(this.pendingText[0]) === JSON.stringify(context)) {
          text = this.pendingText[1];
          helper = this.pendingText[2];
        } else {
          const [generatedText, helperResult] = await fieldText(context, this.options.textModel);
          text = generatedText;
          helper = helperResult;
          this.pendingText = [context, text, helper];
          state.text_calls.push({
            ...helper,
            field: action.label,
            value: text,
          });
        }
      }

      await state.browser.act(action, { text });
      this.pendingText = null;
      state.elapsed_ms = state.started_at ? Math.round(performance.now() - state.started_at) : 0;

      const historyItem: AgentHistoryItem = {
        step: state.history.length + 1,
        action: action.label,
        kind: action.kind,
        choice: selected,
        probability: decision.probabilities[selected] ?? 0,
        confidence: decision.confidence,
        latency_ms: decision.latency_ms,
        text,
        text_helper: helper ? helper.model : null,
        text_latency_ms: helper ? helper.latency_ms : 0,
        operation: decision.operation,
        target: decision.target,
        page_changed: null,
        url: page.url,
        usage: decision.usage,
        executed_ms: state.started_at ? Math.round(performance.now() - state.started_at) : 0,
        elapsed_ms: state.elapsed_ms,
      };
      state.history.push(historyItem);

      state.page = await state.browser.observe(this.screenshots);
      state.elapsed_ms = state.started_at ? Math.round(performance.now() - state.started_at) : 0;

      historyItem.page_changed = state.page.fingerprint !== page.fingerprint;
      historyItem.url = state.page.url;
      historyItem.elapsed_ms = state.elapsed_ms;

      if (state.record && state.page.screenshot && this.recordDir) {
        const frameName = `${String(state.elapsed_ms).padStart(6, '0')}.jpg`;
        await fs.writeFile(
          path.join(this.recordDir, frameName),
          Buffer.from(state.page.screenshot, 'base64')
        );
      }

      // Loop blockage detection: if last 3 non-wait actions caused 0 page change
      const repeated = state.history.slice(-3);
      if (
        repeated.length === 3 &&
        repeated.every((h) => h.page_changed === false && h.kind !== 'wait')
      ) {
        state.status = 'blocked';
      } else {
        state.status = 'ready';
      }
    } else {
      throw new Error(`Unknown agent command: ${String(name)}`);
    }

    return this.snapshot();
  }

  async predict(): Promise<DecisionResult> {
    await this.command('predict');
    return this.state.decision!;
  }

  async act(): Promise<AgentSnapshot> {
    return await this.command('act', { fingerprint: this.state.page.fingerprint });
  }

  async tick(): Promise<AgentSnapshot> {
    return await this.command('tick');
  }

  async *run(): AsyncGenerator<AgentSnapshot, TaskResult, unknown> {
    while (this.state.status !== 'done' && this.state.status !== 'blocked') {
      if (this.state.history.length >= this.maxSteps) {
        this.state.status = 'blocked';
        break;
      }
      yield await this.command('tick');
    }

    return this.toResult();
  }

  async execute(): Promise<TaskResult> {
    for await (const _snapshot of this.run()) {
      // iterate until completion
    }
    return this.toResult();
  }

  toResult(): TaskResult {
    return {
      status: this.state.status === 'done' ? 'done' : 'blocked',
      goal: this.state.goal,
      steps: this.state.history.length,
      elapsedMs: this.state.elapsed_ms,
      finalUrl: this.state.page.url,
      pageTitle: this.state.page.title,
      history: this.state.history,
      textCalls: this.state.text_calls.map((c) => ({
        field: c.field,
        value: c.value,
        model: c.model,
        latency_ms: c.latency_ms,
      })),
      screenshot: this.state.page.screenshot,
    };
  }

  async close(): Promise<void> {
    if (this.state?.browser && !this.options.browser) {
      await this.state.browser.close();
    }
  }
}
