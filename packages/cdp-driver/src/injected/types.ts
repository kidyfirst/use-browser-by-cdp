/**
 * In-browser probe cache interface and global window augmentation.
 */

import type { PageGuard, PageKey } from '../types/page.js';

export interface MoniFastCache {
  ids: WeakMap<Element, number>;
  nodes: Map<number, Element>;
  next: number;
  pageKey: () => PageKey;
  guard: (e: Element | null | undefined) => PageGuard | null;
}

declare global {
  interface Window {
    __moniFast?: MoniFastCache;
  }
}
