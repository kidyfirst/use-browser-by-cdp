/**
 * Maps flat ObservedAction list from @moni/cdp-driver into structured action space for the JEV model.
 */

import type { ActionOperation, ActionSpaceResult, ObservedAction, ObservedElement } from './types.js';

export function actionSpace(actions: ObservedAction[]): ActionSpaceResult {
  const elements: ObservedElement[] = [];
  const indices: Record<number, string> = {};
  const targets: Record<string, Record<string, ObservedAction>> = {};
  const controls: Record<string, ObservedAction> = {};

  const operations: Record<string, ActionOperation> = {
    click: 'CLICK',
    fill: 'TYPE_TEXT',
    select: 'SELECT',
  };

  for (const action of actions) {
    const kind = action.kind;
    const op = operations[kind];
    if (!op) {
      controls[action.id.toUpperCase()] = action;
      continue;
    }

    const node = action.node;
    if (typeof node !== 'number') {
      continue;
    }

    if (!(node in indices)) {
      const index = String(elements.length + 1);
      indices[node] = index;
      const element: ObservedElement = {
        index,
        label: action.label.split(' → ')[0] ?? action.label,
        operations: [],
      };
      if (action.role) element.role = action.role;
      if (action.value !== undefined) element.value = action.value;
      if (action.checked !== undefined) element.checked = action.checked;
      if (action.selected !== undefined) element.selected = action.selected;
      if (action.expanded !== undefined) element.expanded = action.expanded;
      if (kind === 'select') {
        element.value = action.current_value ?? '';
        element.options = [];
      }
      elements.push(element);
    }

    const index = indices[node]!;
    const elementIndex = parseInt(index, 10) - 1;
    const element = elements[elementIndex];
    if (!element) continue;

    if (!element.operations.includes(op)) {
      element.operations.push(op);
    }

    const group = (targets[op] ||= {});
    let target = index;
    if (kind === 'select') {
      const options = (element.options ||= []);
      target = `${index}:${options.length + 1}`;
      options.push({
        index: target,
        label: action.label,
        value: action.value ?? '',
      });
    }
    group[target] = action;
  }

  return { elements, targets, controls };
}
