/**
 * Pure TypeScript in-browser snapshot extractor.
 * Serialized via .toString() and evaluated atomically via CDP Runtime.evaluate.
 */

import type { ObservedAction } from '../types/actions.js';
import type { PageState } from '../types/page.js';
import type { MoniFastCache } from './types.js';

export function captureSnapshot(): PageState | null {
  if (!document.body) return null;

  const w = window as unknown as { __moniFast?: MoniFastCache };
  const cache: MoniFastCache = (w.__moniFast ||= {
    ids: new WeakMap<Element, number>(),
    nodes: new Map<number, Element>(),
    next: 1,
    pageKey: () => [],
    guard: () => null,
  });

  const identity = (e: Element): number => {
    if (!cache.ids.has(e)) cache.ids.set(e, cache.next++);
    const id = cache.ids.get(e)!;
    cache.nodes.set(id, e);
    return id;
  };

  for (const [id, e] of cache.nodes) {
    if (!e.isConnected) cache.nodes.delete(id);
  }

  const safe = (e: Element): boolean => {
    const input = e as HTMLInputElement;
    return !['password', 'file', 'hidden'].includes(input.type);
  };

  const visible = (e: Element): boolean =>
    !e.closest('[aria-hidden="true"],[inert]') &&
    e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

  const name = (e: Element | null, seen = new Set<Element>()): string => {
    if (!e || seen.has(e)) return '';
    seen.add(e);

    const referenced = (e.getAttribute('aria-labelledby') || '')
      .split(/\s+/)
      .map((id) => name(document.getElementById(id), seen))
      .filter(Boolean)
      .join(' ');

    if (referenced) return referenced;

    const ariaLabel = e.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    const labeledInput = e as HTMLInputElement;
    if (labeledInput.labels && labeledInput.labels.length > 0) {
      const labelText = Array.from(labeledInput.labels)
        .map((l) => name(l, seen))
        .filter(Boolean)
        .join(' ');
      if (labelText) return labelText;
    }

    if (['button', 'submit', 'reset'].includes(labeledInput.type) && labeledInput.value) {
      return labeledInput.value;
    }

    const alt = e.getAttribute('alt');
    if (alt) return alt;

    if (e.tagName === 'INPUT') {
      return e.getAttribute('title') || e.getAttribute('placeholder') || '';
    }

    const childText = Array.from(e.childNodes)
      .map((n) => {
        if (n.nodeType === 3) return n.textContent || '';
        if (n.nodeType === 1) {
          const el = n as Element;
          return el.getAttribute('aria-hidden') !== 'true' ? name(el, seen) : '';
        }
        return '';
      })
      .join(' ')
      .trim();

    return childText || e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };

  const roles = [
    'button',
    'link',
    'checkbox',
    'radio',
    'switch',
    'tab',
    'menuitem',
    'menuitemradio',
    'option',
    'gridcell',
    'combobox',
    'textbox',
    'searchbox',
    'spinbutton',
  ];

  const selector =
    'a[href],button,input,textarea,select,summary,[contenteditable="true"],' +
    roles.map((r) => `[role="${r}"]`).join(',');

  const role = (e: Element): string | null => {
    const explicit = e.getAttribute('role');
    if (explicit && roles.includes(explicit)) return explicit;
    if (e.tagName === 'BUTTON' || e.tagName === 'SUMMARY') return 'button';
    if (e.tagName === 'A') return 'link';
    if (e.tagName === 'SELECT') return 'combobox';
    if (e.tagName === 'TEXTAREA' || (e as HTMLElement).isContentEditable) return 'textbox';
    if (e.tagName === 'INPUT') {
      const input = e as HTMLInputElement;
      if (['checkbox', 'radio'].includes(input.type)) return input.type;
      if (['button', 'submit', 'reset', 'image'].includes(input.type)) return 'button';
      if (input.type === 'search') return 'searchbox';
      if (input.type === 'number') return 'spinbutton';
      if (['text', 'email', 'url', 'tel'].includes(input.type)) return 'textbox';
    }
    return null;
  };

  cache.pageKey = () => [
    performance.timeOrigin,
    location.href,
    scrollX,
    scrollY,
    innerWidth,
    innerHeight,
    Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input,textarea,select'))
      .filter(safe)
      .map((e) => {
        const select = e as HTMLSelectElement;
        const input = e as HTMLInputElement;
        return [identity(e), e.value, input.checked, select.selectedIndex, e.disabled, (e as any).readOnly];
      }),
  ];

  cache.guard = (e: Element | null | undefined) => {
    if (!e || !e.isConnected || !visible(e)) return null;
    const input = e as HTMLInputElement;
    const select = e as HTMLSelectElement;
    const scope = e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]') || e.parentElement;
    return [
      identity(e),
      role(e),
      name(e),
      input.value ?? null,
      input.checked ?? null,
      select.selectedIndex ?? null,
      input.readOnly ?? null,
      e.matches(':disabled'),
      e.getAttribute('aria-disabled'),
      e.getAttribute('aria-expanded'),
      e.getAttribute('aria-checked'),
      e.getAttribute('aria-selected'),
      e.getAttribute('href'),
      (scope as HTMLElement | null)?.innerText?.slice(0, 6000) || '',
    ];
  };

  const actions: ObservedAction[] = [];
  for (const e of Array.from(document.querySelectorAll(selector))) {
    if (!safe(e) || !visible(e) || e.matches(':disabled') || e.closest('[aria-disabled="true"]')) {
      continue;
    }

    const r = e.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const rname = role(e);

    if (!rname || r.width <= 0 || r.height <= 0 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
      continue;
    }

    if (rname === 'gridcell' && e.querySelector('button,[role="button"]')) {
      continue;
    }

    const base: ObservedAction = {
      id: '',
      node: identity(e),
      role: rname,
      label: name(e) || rname,
      kind: 'click',
      rect: { x: r.x, y: r.y, w: r.width, h: r.height },
    };

    for (const key of ['checked', 'selected', 'expanded'] as const) {
      const value = e.getAttribute('aria-' + key);
      if (value !== null) (base as any)[key] = value;
    }

    const input = e as HTMLInputElement;
    if (['checkbox', 'radio'].includes(input.type)) {
      base.checked = String(input.checked);
    }

    if (e.tagName === 'SELECT') {
      const select = e as HTMLSelectElement;
      for (const o of Array.from(select.options)) {
        if (!o.selected && !o.disabled && !o.closest('optgroup[disabled]')) {
          actions.push({
            ...base,
            kind: 'select',
            value: o.value,
            current_value: Array.from(select.selectedOptions).map((opt) => opt.label).join(', '),
            label: base.label + ' → ' + o.label,
          });
        }
      }
    } else {
      const isEditable =
        !input.readOnly &&
        e.getAttribute('aria-readonly') !== 'true' &&
        (['textbox', 'searchbox', 'spinbutton'].includes(rname) ||
          (rname === 'combobox' && ['INPUT', 'TEXTAREA'].includes(e.tagName)));

      const value =
        'value' in e
          ? String(input.value)
          : (e as HTMLElement).isContentEditable || rname === 'combobox'
          ? (e as HTMLElement).innerText.trim()
          : '';

      actions.push({ ...base, kind: isEditable ? 'fill' : 'click', value });
      if (isEditable) {
        actions.push({ ...base, kind: 'click', value, label: 'Open ' + base.label });
      }
    }
  }

  const words: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let node: Node | null;
  let length = 0;

  while ((node = walker.nextNode()) && length < 6000) {
    const value = node.textContent?.trim() || '';
    const parent = node.parentElement;
    if (!value || !parent || parent.closest('script,style,noscript,template') || !visible(parent)) {
      continue;
    }
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
      words.push(value);
      length += value.length;
    }
  }

  const text = words.join('\n').slice(0, 6000);
  const height = document.documentElement.scrollHeight;
  const page_key = cache.pageKey();
  const guards: Record<string, any> = {};

  for (const a of actions) {
    if (a.node !== undefined && !(String(a.node) in guards)) {
      guards[String(a.node)] = cache.guard(cache.nodes.get(a.node));
    }
  }

  const semantics = actions.map(({ rect: _r, ...action }) => action);
  const marker = [
    performance.timeOrigin,
    location.href,
    scrollX,
    scrollY,
    innerWidth,
    innerHeight,
    document.title,
    text,
    semantics,
    page_key[6],
  ];

  const omitted_actions = Math.max(0, actions.length - 250);
  actions.splice(250);
  actions.forEach((a, i) => {
    a.id = 'e' + (i + 1);
  });

  if (scrollY + innerHeight < height - 2) {
    actions.push({ id: 'scroll_down', kind: 'scroll', label: 'Scroll down', role: 'button', delta: 560 });
  }
  if (scrollY > 0) {
    actions.push({ id: 'scroll_up', kind: 'scroll', label: 'Scroll up', role: 'button', delta: -560 });
  }
  actions.push({ id: 'wait', kind: 'wait', label: 'Wait for the page to update', role: 'button' });

  return {
    url: location.href,
    title: document.title,
    w: innerWidth,
    h: innerHeight,
    text,
    scroll: { y: scrollY, height },
    actions,
    marker,
    page_key,
    guards,
    omitted_actions,
    fingerprint: '',
  };
}
