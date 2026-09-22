/**
 * Custom error types for CDP Driver.
 */

export class StalePageError extends Error {
  constructor(message = 'The page changed or target was occluded since observation.') {
    super(message);
    this.name = 'StalePageError';
  }
}

export class CDPConnectionError extends Error {
  constructor(message = 'Failed to connect to Chrome DevTools Protocol.') {
    super(message);
    this.name = 'CDPConnectionError';
  }
}

export class TargetNotFoundError extends Error {
  constructor(message = 'Target element was not found in observed DOM nodes.') {
    super(message);
    this.name = 'TargetNotFoundError';
  }
}
