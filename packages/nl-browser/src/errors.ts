/**
 * Custom error types for @moni/nl-browser.
 */

export class ModelUnavailableError extends Error {
  constructor(message = 'Model provider connection failed or returned an error; no action executed.') {
    super(message);
    this.name = 'ModelUnavailableError';
  }
}

export class AgentTimeoutError extends Error {
  constructor(message = 'The agent execution exceeded maximum timeout or step budget.') {
    super(message);
    this.name = 'AgentTimeoutError';
  }
}

export class BlockedError extends Error {
  constructor(message = 'Agent execution is blocked and cannot make further progress.') {
    super(message);
    this.name = 'BlockedError';
  }
}
