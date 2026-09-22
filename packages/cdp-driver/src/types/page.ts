/**
 * Page state and guard representation types.
 */

import type { ObservedAction } from './actions.js';

export interface PageScroll {
  y: number;
  height?: number;
}

export type PageGuard = unknown[];
export type PageKey = unknown[];
export type PageMarker = unknown[];

export interface PageState {
  url: string;
  title: string;
  w?: number;
  h?: number;
  text: string;
  scroll: PageScroll;
  actions: ObservedAction[];
  marker?: PageMarker;
  page_key?: PageKey;
  guards?: Record<string, PageGuard>;
  omitted_actions?: number;
  fingerprint: string;
  screenshot?: string; // base64 JPEG
}
