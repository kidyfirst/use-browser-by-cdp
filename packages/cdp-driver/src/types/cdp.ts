/**
 * CDP transport interfaces and message types.
 */

export interface CDPMessage {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

export interface CDPTransport {
  call<T = unknown>(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<T>;
  evaluate<T = unknown>(expression: string): Promise<T>;
  close(): Promise<void>;
}
