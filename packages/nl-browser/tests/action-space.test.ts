import { describe, expect, it } from 'vitest';
import { actionSpace } from '../src/action-space.js';
import type { ObservedAction } from '../src/types.js';

describe('@moni/nl-browser Action Space', () => {
  it('correctly maps raw actions into indexed elements and operation target groups', () => {
    const rawActions: ObservedAction[] = [
      {
        id: 'e1',
        node: 1,
        kind: 'fill',
        role: 'textbox',
        label: 'Search Input',
        value: '',
      },
      {
        id: 'e2',
        node: 2,
        kind: 'click',
        role: 'button',
        label: 'Submit Button',
      },
      {
        id: 'e3',
        node: 3,
        kind: 'select',
        role: 'combobox',
        label: 'Country Option 1',
        value: 'US',
        current_value: 'CN',
      },
      {
        id: 'e4',
        node: 3,
        kind: 'select',
        role: 'combobox',
        label: 'Country Option 2',
        value: 'UK',
        current_value: 'CN',
      },
      {
        id: 'wait',
        kind: 'wait',
        role: 'button',
        label: 'Wait for page update',
      },
    ];

    const result = actionSpace(rawActions);

    expect(result.elements).toHaveLength(3); // node 1, 2, 3

    // Node 1: fill
    expect(result.elements[0]?.index).toBe('1');
    expect(result.elements[0]?.label).toBe('Search Input');
    expect(result.elements[0]?.operations).toEqual(['TYPE_TEXT']);
    expect(result.targets['TYPE_TEXT']?.['1']?.id).toBe('e1');

    // Node 2: click
    expect(result.elements[1]?.index).toBe('2');
    expect(result.elements[1]?.label).toBe('Submit Button');
    expect(result.elements[1]?.operations).toEqual(['CLICK']);
    expect(result.targets['CLICK']?.['2']?.id).toBe('e2');

    // Node 3: select with 2 options
    expect(result.elements[2]?.index).toBe('3');
    expect(result.elements[2]?.operations).toEqual(['SELECT']);
    expect(result.elements[2]?.options).toHaveLength(2);
    expect(result.targets['SELECT']?.['3:1']?.id).toBe('e3');
    expect(result.targets['SELECT']?.['3:2']?.id).toBe('e4');

    // Control: wait
    expect(result.controls['WAIT']?.id).toBe('wait');
  });

  it('skips actions without a numeric node identifier', () => {
    const rawActions: ObservedAction[] = [
      {
        id: 'wait',
        kind: 'wait',
        role: 'button',
        label: 'Wait for page update',
      },
    ];
    const result = actionSpace(rawActions);
    expect(result.elements).toHaveLength(0);
    expect(result.controls['WAIT']?.id).toBe('wait');
  });
});
