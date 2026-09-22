/**
 * Pure TypeScript in-browser action executor guards and helpers.
 * Serialized via .toString() for execution via CDP Runtime.evaluate.
 */

import type { ObservedAction } from '../types/actions.js';

/**
 * Pre-flight target validation and coordinate resolution.
 * Checks connectedness, visibility, disabled state, and occlusion before input.
 */
export function resolveActionTarget(action: ObservedAction): { x: number; y: number } | null {
  if (typeof action.node !== 'number') return null;

  const node = window.__moniFast?.nodes.get(action.node);
  if (!node) return null;

  const element = node as HTMLElement;
  if (
    !element.isConnected ||
    element.matches(':disabled') ||
    element.closest('[aria-disabled="true"],[inert]') ||
    !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  ) {
    return null;
  }

  const input = element as HTMLInputElement;
  if (action.kind === 'fill' && (input.readOnly || element.getAttribute('aria-readonly') === 'true')) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  if (!rect.width || !rect.height || x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) {
    return null;
  }

  // Occlusion test: verify top-most element at coordinates
  const topElement = document.elementFromPoint(x, y);
  if (!topElement || !element.contains(topElement)) {
    return null;
  }

  if (action.kind === 'select') {
    const select = element as HTMLSelectElement;
    if (
      select.tagName !== 'SELECT' ||
      !Array.from(select.options).some(
        (o) => o.value === action.value && !o.disabled && !o.closest('optgroup[disabled]')
      )
    ) {
      return null;
    }
    select.value = action.value ?? '';
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  return { x, y };
}

/**
 * Post-input settlement watcher for combobox autocomplete suggestions.
 */
export function waitForAutocomplete(action: ObservedAction): Promise<void> {
  return new Promise<void>((resolve) => {
    const field = typeof action.node === 'number' ? window.__moniFast?.nodes.get(action.node) : null;
    const isAutocomplete = action.kind === 'fill' && field?.getAttribute('role') === 'combobox';

    let frames = 0;
    let stopped = false;

    const finish = () => {
      stopped = true;
      resolve();
    };

    setTimeout(finish, isAutocomplete ? 200 : 50);

    const ready = () => {
      if (stopped) return;

      const ids = (field?.getAttribute('aria-controls') || field?.getAttribute('aria-owns') || '')
        .split(/\s+/)
        .filter(Boolean);

      const roots = ids.length
        ? ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => Boolean(el))
        : [document];

      const options = roots.flatMap((root) =>
        Array.from(root.querySelectorAll<HTMLElement>('[role="option"]'))
      );

      if (
        ++frames >= 2 &&
        (!isAutocomplete ||
          options.some((e) => {
            const r = e.getBoundingClientRect();
            return (
              r.width > 0 &&
              r.height > 0 &&
              r.bottom > 0 &&
              r.top < window.innerHeight &&
              e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            );
          }))
      ) {
        finish();
      } else {
        requestAnimationFrame(ready);
      }
    };

    requestAnimationFrame(ready);
  });
}
