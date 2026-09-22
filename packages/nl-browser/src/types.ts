/**
 * Core type definitions for @moni/nl-browser.
 */

import type { ActionKind, Browser, ElementRect, ObservedAction, PageState } from '@moni/cdp-driver';

export type { ActionKind, ElementRect, ObservedAction, PageState };

export type ActionOperation =
  | 'CLICK'
  | 'TYPE_TEXT'
  | 'SELECT'
  | 'SCROLL_UP'
  | 'SCROLL_DOWN'
  | 'WAIT'
  | 'DONE'
  | 'BLOCKED';

export interface SelectOption {
  index: string;
  label: string;
  value: string;
}

export interface ObservedElement {
  index: string;
  label: string;
  role?: string;
  value?: string;
  checked?: string;
  selected?: boolean;
  expanded?: string;
  operations: ActionOperation[];
  options?: SelectOption[];
}

export interface ActionSpaceResult {
  elements: ObservedElement[];
  targets: Record<string, Record<string, ObservedAction>>;
  controls: Record<string, ObservedAction>;
}

export interface ChoiceAnswer<T extends string = string> {
  choice: T;
  confidence: number;
  probabilities: Record<T, number>;
}

export interface TypeSafeQuestionItem {
  type: 'choice';
  criteria: Record<string, unknown>;
  instructions: {
    goal: string;
    rules: string | string[];
    operation?: string;
  };
}

export interface TypeSafeRequestBody {
  model: string;
  state: {
    page: {
      url: string;
      title: string;
      text: string;
    };
    elements: ObservedElement[];
    recent_actions: Array<{
      action?: string;
      kind?: ActionKind;
      text?: string | null;
      page_changed?: boolean | null;
    }>;
  };
  questions: Record<string, TypeSafeQuestionItem>;
}

export interface TypeSafeResponseBody {
  model: string;
  answers: Record<string, ChoiceAnswer>;
  usage?: Record<string, unknown>;
}

export interface DecisionResult {
  choice: string;
  operation: ActionOperation;
  target: string | null;
  confidence: number;
  probabilities: Record<string, number>;
  operation_probabilities: Record<string, number>;
  target_probabilities: Record<string, number>;
  target_confidence: number | null;
  raw_answers: Record<string, ChoiceAnswer>;
  model: string;
  usage: Record<string, unknown>;
  latency_ms: number;
  request?: unknown;
  fingerprint?: string;
  elapsed_ms?: number;
}

export interface FieldContext {
  goal: string;
  field: {
    label?: string;
    role?: string;
    value?: string;
  };
  page: {
    title: string;
    text: string;
  };
  recent_actions: Array<{
    action?: string;
    text?: string | null;
  }>;
}

export interface TextHelperResult {
  model: string;
  latency_ms: number;
  usage?: Record<string, unknown>;
}

export type AgentStatus = 'idle' | 'ready' | 'predicted' | 'done' | 'blocked';

export interface AgentHistoryItem {
  step: number;
  action: string;
  kind: ActionKind;
  choice: string;
  probability: number;
  confidence: number;
  latency_ms: number;
  text: string | null;
  text_helper: string | null;
  text_latency_ms: number;
  operation: ActionOperation;
  target: string | null;
  page_changed: boolean | null;
  url: string;
  usage: Record<string, unknown>;
  executed_ms: number;
  elapsed_ms: number;
}

export interface AgentSnapshot {
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
  elements: ObservedElement[];
}

export type AgentCommandName = 'tick' | 'predict' | 'act';

/**
 * JEV UI Decision Model Configuration
 */
export interface JevModelOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * LLM Text Helper Configuration
 */
export interface TextModelOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  reasoning?: 'low' | 'none' | 'disabled';
  timeoutMs?: number;
}

/**
 * Options for initializing NLBrowser agent
 */
export interface NLBrowserOptions {
  browser?: Browser;
  cdpUrl?: string;
  jev?: JevModelOptions;
  textModel?: TextModelOptions;
  maxSteps?: number;
  screenshots?: boolean;
  recordDir?: string;
  verbose?: boolean;
}

/**
 * Options for one-shot runTask execution
 */
export interface RunTaskOptions extends NLBrowserOptions {
  startUrl: string;
  goal: string | string[];
}

/**
 * Summary result returned when a task concludes
 */
export interface TaskResult {
  status: 'done' | 'blocked' | 'timeout';
  goal: string;
  steps: number;
  elapsedMs: number;
  finalUrl: string;
  pageTitle: string;
  history: AgentHistoryItem[];
  textCalls: Array<{ field: string; value: string; model: string; latency_ms: number }>;
  screenshot?: string;
}
