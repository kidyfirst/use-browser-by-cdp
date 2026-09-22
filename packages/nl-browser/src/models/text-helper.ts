/**
 * LLM Text Helper Client.
 * Uses an OpenAI-compatible Chat Completions model (e.g. DeepSeek, OpenAI, Qwen, Ollama)
 * specifically to infer exact field string values when JEV selects TYPE_TEXT.
 */

import { TEXT_VALUE } from '../questions.js';
import type { FieldContext, ObservedAction, PageState, TextHelperResult, TextModelOptions } from '../types.js';
import { postJson } from './http.js';

export function fieldContext(
  goal: string,
  action: ObservedAction,
  page: PageState,
  history: Array<{ action?: string; text?: string | null }>
): FieldContext {
  return {
    goal,
    field: {
      label: action.label,
      role: action.role,
      value: action.value,
    },
    page: {
      title: page.title,
      text: page.text.slice(0, 6000),
    },
    recent_actions: history.slice(-6).map((h) => ({
      action: h.action,
      text: h.text,
    })),
  };
}

interface OpenAIChatResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: Record<string, unknown>;
}

export async function fieldText(
  context: FieldContext,
  options: TextModelOptions = {}
): Promise<[string, TextHelperResult]> {
  const key =
    options.apiKey ||
    process.env['TEXT_MODEL_API_KEY'] ||
    process.env['OPENAI_API_KEY'];

  if (!key) {
    throw new Error(
      'TYPE_TEXT requires an LLM API key. Please provide options.textModel.apiKey or set TEXT_MODEL_API_KEY/OPENAI_API_KEY environment variable.'
    );
  }

  const base = (
    options.baseUrl ||
    process.env['TEXT_MODEL_BASE_URL'] ||
    process.env['OPENAI_BASE_URL'] ||
    'https://api.deepseek.com/v1'
  ).replace(/\/+$/, '');

  const model =
    options.model ||
    process.env['TEXT_MODEL'] ||
    'deepseek-chat';

  let reasoning: Record<string, unknown>;
  if (options.reasoning === 'none' || process.env['TEXT_MODEL_REASONING'] === 'none') {
    reasoning = { reasoning: { enabled: false } };
  } else if (base.includes('api.deepseek.com')) {
    reasoning = { thinking: { type: 'disabled' } };
  } else {
    reasoning = { reasoning: { effort: options.reasoning || 'low' } };
  }

  const started = performance.now();
  const endpoint = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;

  const result = await postJson<OpenAIChatResponse>(
    endpoint,
    key,
    {
      model,
      max_tokens: 1024,
      response_format: { type: 'json_object' },
      ...reasoning,
      messages: [
        { role: 'system', content: TEXT_VALUE },
        { role: 'user', content: JSON.stringify(context) },
      ],
    },
    options.timeoutMs ?? 30000
  );

  let value: string;
  try {
    const rawContent = result.choices[0]?.message?.content;
    if (!rawContent) throw new Error();
    const output = JSON.parse(rawContent) as Record<string, unknown>;
    const textVal = output['text'];
    const keys = Object.keys(output);
    if (
      keys.length !== 1 ||
      keys[0] !== 'text' ||
      typeof textVal !== 'string' ||
      !textVal.trim() ||
      textVal.length > 2000
    ) {
      throw new Error();
    }
    value = textVal;
  } catch {
    throw new Error('Text helper returned no valid field value; nothing typed.');
  }

  return [
    value,
    {
      model,
      latency_ms: Math.round(performance.now() - started),
      usage: result.usage ?? {},
    },
  ];
}
