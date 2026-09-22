/**
 * JEV UI Policy Decision Client.
 * Connects to TypeSafe / JEV SystemOne API to determine UI operations and targets.
 */

import { actionSpace } from '../action-space.js';
import { NEXT_ACTION, TARGET } from '../questions.js';
import type {
  ActionOperation,
  ChoiceAnswer,
  DecisionResult,
  JevModelOptions,
  PageState,
  TypeSafeQuestionItem,
  TypeSafeRequestBody,
  TypeSafeResponseBody,
} from '../types.js';
import { postJson } from './http.js';

export function validateChoice<T extends string>(
  answer: unknown,
  ids: Iterable<T> | Set<T> | Record<T, unknown>
): ChoiceAnswer<T> {
  const allowedSet = new Set(
    Array.isArray(ids) ? ids : ids instanceof Set ? ids : Object.keys(ids)
  ) as Set<T>;

  if (!answer || typeof answer !== 'object') {
    throw new Error('Invalid answer object');
  }
  const a = answer as Record<string, unknown>;
  const choice = a['choice'] as T;
  const confidence = a['confidence'] as number;
  const probabilities = a['probabilities'] as Record<T, number>;

  if (typeof choice !== 'string' || !allowedSet.has(choice)) {
    throw new Error(`Invalid choice ID: ${String(choice)}`);
  }

  if (
    typeof confidence !== 'number' ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1
  ) {
    throw new Error('Invalid confidence score');
  }

  if (!probabilities || typeof probabilities !== 'object') {
    throw new Error('Missing probabilities map');
  }

  const probKeys = Object.keys(probabilities) as T[];
  if (probKeys.length !== allowedSet.size) {
    throw new Error('Probabilities length mismatch');
  }

  for (const key of probKeys) {
    if (!allowedSet.has(key)) {
      throw new Error(`Unexpected probability key: ${key}`);
    }
    const val = probabilities[key];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1) {
      throw new Error(`Invalid probability value for ${key}`);
    }
  }

  const sum = Object.values(probabilities).reduce((acc: number, cur) => acc + (cur as number), 0);
  if (Math.abs(sum - 1) >= 0.02) {
    throw new Error(`Probabilities sum out of tolerance: ${sum}`);
  }

  const maxProb = Math.max(...Object.values(probabilities).map((n) => n as number));
  const chosenProb = probabilities[choice];
  if (chosenProb === undefined || chosenProb < maxProb - 1e-6) {
    throw new Error('Chosen probability is not maximum');
  }

  return {
    choice,
    confidence,
    probabilities,
  };
}

export async function choose(
  state: PageState,
  goal: string,
  history: Array<{ action?: string; kind?: string; text?: string | null; page_changed?: boolean | null }>,
  options: JevModelOptions = {}
): Promise<DecisionResult> {
  const { elements, targets, controls } = actionSpace(state.actions);

  const labels: Record<string, string> = {
    CLICK: 'Click an element, button, menu option, autocomplete suggestion, or calendar day.',
    TYPE_TEXT: 'Enter or replace text in an editable field. A small LLM will supply the value from the goal.',
    SELECT: 'Select an observed dropdown value.',
  };

  const operations: Record<string, string> = {};
  for (const key of Object.keys(targets)) {
    if (labels[key]) {
      operations[key] = labels[key]!;
    }
  }
  for (const [key, value] of Object.entries(controls)) {
    operations[key] = value.label;
  }
  operations['DONE'] = 'Every requirement is visibly satisfied.';
  operations['BLOCKED'] = 'No supported operation can progress.';

  const questions: Record<string, TypeSafeQuestionItem> = {
    operation: {
      type: 'choice',
      criteria: operations,
      instructions: { goal, rules: NEXT_ACTION },
    },
  };

  for (const [operation, candidates] of Object.entries(targets)) {
    const criteria: Record<string, unknown> = {};
    for (const [index, a] of Object.entries(candidates)) {
      const item: Record<string, unknown> = {
        element: `[${index}] ${a.label}`,
        current_value: a.current_value ?? a.value ?? '',
      };
      if (a.role) item['role'] = a.role;
      if (a.checked !== undefined) item['checked'] = a.checked;
      if (a.selected !== undefined) item['selected'] = a.selected;
      if (a.expanded !== undefined) item['expanded'] = a.expanded;
      criteria[index] = item;
    }

    questions[`${operation.toLowerCase()}_target`] = {
      type: 'choice',
      criteria,
      instructions: { goal, operation, rules: [NEXT_ACTION, TARGET] },
    };
  }

  const model = options.model || process.env['TYPESAFE_MODEL'] || 'jev-latest';
  const apiKey = options.apiKey || process.env['TYPESAFE_API_KEY'];
  const baseUrl = (options.baseUrl || process.env['TYPESAFE_BASE_URL'] || 'https://api.typesafe.ai/v1/systemone').replace(/\/+$/, '');

  if (!apiKey) {
    throw new Error('Missing TYPESAFE_API_KEY for JEV model. Please provide options.jev.apiKey or set TYPESAFE_API_KEY environment variable.');
  }

  const body: TypeSafeRequestBody = {
    model,
    state: {
      page: {
        url: state.url,
        title: state.title,
        text: state.text,
      },
      elements,
      recent_actions: history.slice(-10).map((h) => ({
        action: h.action,
        kind: h.kind as any,
        text: h.text,
        page_changed: h.page_changed,
      })),
    },
    questions,
  };

  const started = performance.now();
  const result = await postJson<TypeSafeResponseBody>(
    baseUrl,
    apiKey,
    body,
    options.timeoutMs ?? 30000
  );

  const operationAnswer = validateChoice(result.answers['operation'], operations);
  const operation = operationAnswer.choice as ActionOperation;

  let target: string | null = null;
  let targetAnswer: ChoiceAnswer | null = null;
  let probabilities: Record<string, number> = {};
  let choice: string;

  if (operation in targets && targets[operation]) {
    const group = targets[operation]!;
    targetAnswer = validateChoice(result.answers[`${operation.toLowerCase()}_target`], group);
    target = targetAnswer.choice;
    const actionObj = group[target];
    if (!actionObj) {
      throw new Error('Invalid TypeSafe response; target not in candidates');
    }
    choice = actionObj.id;
    probabilities = {};
    for (const [index, a] of Object.entries(group)) {
      probabilities[a.id] = targetAnswer.probabilities[index] ?? 0;
    }
  } else {
    choice = controls[operation] ? controls[operation]!.id : operation;
    probabilities[choice] = operationAnswer.probabilities[operation] ?? 1;
  }

  return {
    choice,
    operation,
    target,
    confidence: operationAnswer.confidence,
    probabilities,
    operation_probabilities: operationAnswer.probabilities,
    target_probabilities: targetAnswer ? targetAnswer.probabilities : {},
    target_confidence: targetAnswer ? targetAnswer.confidence : null,
    raw_answers: result.answers,
    model: result.model || model,
    usage: result.usage ?? {},
    latency_ms: Math.round(performance.now() - started),
    request: body,
  };
}
