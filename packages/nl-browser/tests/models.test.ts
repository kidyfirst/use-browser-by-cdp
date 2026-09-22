import { describe, expect, it } from 'vitest';
import { validateChoice } from '../src/models/jev.js';
import { fieldContext } from '../src/models/text-helper.js';
import type { ObservedAction, PageState } from '../src/types.js';

describe('@moni/nl-browser Model Utilities', () => {
  describe('validateChoice', () => {
    const validIds = ['CLICK', 'TYPE_TEXT', 'DONE'];

    it('passes on strictly valid choice and probabilities', () => {
      const validPayload = {
        choice: 'CLICK',
        confidence: 0.95,
        probabilities: {
          CLICK: 0.95,
          TYPE_TEXT: 0.03,
          DONE: 0.02,
        },
      };

      const result = validateChoice(validPayload, validIds);
      expect(result.choice).toBe('CLICK');
      expect(result.confidence).toBe(0.95);
      expect(result.probabilities['CLICK']).toBe(0.95);
    });

    it('throws error when choice is not in allowed set', () => {
      const invalidPayload = {
        choice: 'UNKNOWN',
        confidence: 0.9,
        probabilities: {
          CLICK: 0.5,
          TYPE_TEXT: 0.3,
          DONE: 0.2,
        },
      };
      expect(() => validateChoice(invalidPayload, validIds)).toThrow('Invalid choice ID');
    });

    it('throws error when probabilities sum deviates significantly from 1', () => {
      const badSumPayload = {
        choice: 'CLICK',
        confidence: 0.9,
        probabilities: {
          CLICK: 0.5,
          TYPE_TEXT: 0.1,
          DONE: 0.1, // sum is 0.7
        },
      };
      expect(() => validateChoice(badSumPayload, validIds)).toThrow('Probabilities sum out of tolerance');
    });

    it('throws error when confidence is outside [0, 1]', () => {
      const badConfidence = {
        choice: 'CLICK',
        confidence: 1.5,
        probabilities: {
          CLICK: 0.8,
          TYPE_TEXT: 0.1,
          DONE: 0.1,
        },
      };
      expect(() => validateChoice(badConfidence, validIds)).toThrow('Invalid confidence score');
    });
  });

  describe('fieldContext', () => {
    it('constructs correct context for text generation', () => {
      const action: ObservedAction = {
        id: 'e1',
        node: 1,
        kind: 'fill',
        role: 'textbox',
        label: 'Destination City',
        value: '',
      };
      const page: PageState = {
        url: 'https://flights.example.com',
        title: 'Flight Search',
        text: 'Book flights worldwide easily.',
        scroll: { y: 0 },
        actions: [action],
        fingerprint: 'abc',
      };

      const ctx = fieldContext('Search flights to Tokyo', action, page, [
        { action: 'Departure City', text: 'Beijing' },
      ]);

      expect(ctx.goal).toBe('Search flights to Tokyo');
      expect(ctx.field.label).toBe('Destination City');
      expect(ctx.page.title).toBe('Flight Search');
      expect(ctx.recent_actions).toHaveLength(1);
      expect(ctx.recent_actions[0]?.text).toBe('Beijing');
    });
  });
});
