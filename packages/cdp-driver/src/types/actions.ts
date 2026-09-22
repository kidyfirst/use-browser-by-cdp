/**
 * Action and Element representation types for CDP Driver.
 */

export type ActionKind = 'click' | 'fill' | 'select' | 'scroll' | 'wait';

export interface ElementRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ObservedAction {
  id: string;
  node?: number;
  kind: ActionKind;
  role: string;
  label: string;
  value?: string;
  current_value?: string;
  rect?: ElementRect;
  checked?: string;
  selected?: boolean;
  expanded?: string;
  delta?: number;
}

export interface ActOptions {
  text?: string | null;
}

export interface ActResult {
  executed: string;
}
