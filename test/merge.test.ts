import { describe, it, expect } from 'vitest';
import { mergeEntriesWithHistory } from '../src/registry/merge.js';
import { createEmptyRegistry, type Registry, type RegistryEntry } from '../src/registry/schema.js';
import type { HistoryMap } from '../src/registry/history.js';

const BARE_ENTRY: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
  component: 'c.html',
  tag: 'input',
  element_type: 'native_input',
  fingerprint: 'f',
  semantic: {
    formcontrolname: null,
    aria_label: null,
    placeholder: null,
    text_content: null,
    type: null
  },
  source: 'generated'
};

describe('mergeEntriesWithHistory', () => {
  it('classifies never-seen ids as new and initializes their history', () => {
    const { merged, dispositions } = mergeEntriesWithHistory({
      previous: null,
      history: new Map(),
      newEntries: { foo: BARE_ENTRY },
      nextVersion: 1,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged.foo?.first_seen_version).toBe(1);
    expect(merged.foo?.last_seen_version).toBe(1);
    expect(merged.foo?.last_generated_at).toBe('2026-04-17T10:00:00Z');
    expect(merged.foo?.generation_history).toEqual([1]);
    expect(dispositions.get('foo')?.disposition).toBe('new');
  });

  it('carries over entries unchanged when they were in the previous registry', () => {
    const previous: Registry = {
      ...createEmptyRegistry(2, '2026-01-01T00:00:00Z'),
      entries: {
        foo: {
          ...BARE_ENTRY,
          first_seen_version: 1,
          last_seen_version: 2,
          last_generated_at: '2026-01-01T00:00:00Z',
          generation_history: [1]
        }
      }
    };
    const { merged, dispositions } = mergeEntriesWithHistory({
      previous,
      history: new Map([
        ['foo', { first_seen_version: 1, latest_recorded_version: 2, generation_history: [1] }]
      ]),
      newEntries: { foo: BARE_ENTRY },
      nextVersion: 3,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged.foo?.first_seen_version).toBe(1);
    expect(merged.foo?.last_seen_version).toBe(3);
    // last_generated_at must NOT be bumped when the entry is simply carried over.
    expect(merged.foo?.last_generated_at).toBe('2026-01-01T00:00:00Z');
    expect(merged.foo?.generation_history).toEqual([1]);
    expect(dispositions.get('foo')?.disposition).toBe('carried-over');
  });

  it('regenerates an id that was absent in previous but present in an older version', () => {
    const previous: Registry = createEmptyRegistry(2, '2026-01-01T00:00:00Z');
    const history: HistoryMap = new Map([
      ['foo', { first_seen_version: 1, latest_recorded_version: 1, generation_history: [1] }]
    ]);
    const { merged, dispositions } = mergeEntriesWithHistory({
      previous,
      history,
      newEntries: { foo: BARE_ENTRY },
      nextVersion: 3,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged.foo?.first_seen_version).toBe(1);
    expect(merged.foo?.last_generated_at).toBe('2026-04-17T10:00:00Z');
    expect(merged.foo?.generation_history).toEqual([1, 3]);
    const info = dispositions.get('foo');
    expect(info?.disposition).toBe('regenerated');
    expect(info?.previousVersion).toBe(1);
  });

  it('carries locator_name from a removed entry onto a similar new one', () => {
    const previous: Registry = {
      ...createEmptyRegistry(2, '2026-01-01T00:00:00Z'),
      entries: {
        'order-list__input--customer-name': {
          ...BARE_ENTRY,
          semantic: {
            formcontrolname: 'customer',
            aria_label: 'Customer name',
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 2,
          locator_name: 'orderList_input_customer'
        }
      }
    };
    // New testid appears after an aria-label rewording; the old key is gone.
    const renamed: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
      ...BARE_ENTRY,
      semantic: {
        formcontrolname: 'customer',
        aria_label: 'Customer full name',
        placeholder: null,
        text_content: null,
        type: null
      }
    };
    const { merged, dispositions } = mergeEntriesWithHistory({
      previous,
      history: new Map(),
      newEntries: { 'order-list__input--customer-full-name': renamed },
      nextVersion: 3,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged['order-list__input--customer-full-name']?.locator_name).toBe(
      'orderList_input_customer'
    );
    expect(dispositions.get('order-list__input--customer-full-name')?.renamedFrom).toBe(
      'order-list__input--customer-name'
    );
  });

  it('does not carry locator_name when similarity is below threshold', () => {
    const previous: Registry = {
      ...createEmptyRegistry(2, '2026-01-01T00:00:00Z'),
      entries: {
        'old-id': {
          ...BARE_ENTRY,
          semantic: {
            formcontrolname: 'customer',
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 2,
          locator_name: 'orderList_input_customer'
        }
      }
    };
    const unrelated: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
      ...BARE_ENTRY,
      tag: 'button',
      element_type: 'native_button',
      semantic: {
        formcontrolname: null,
        aria_label: null,
        placeholder: null,
        text_content: 'Submit',
        type: null
      }
    };
    const { merged, dispositions } = mergeEntriesWithHistory({
      previous,
      history: new Map(),
      newEntries: { 'completely-unrelated': unrelated },
      nextVersion: 3,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged['completely-unrelated']?.locator_name).toBeUndefined();
    expect(dispositions.get('completely-unrelated')?.renamedFrom).toBeUndefined();
  });

  it('greedy-matches best donor when multiple removed entries could claim a new one', () => {
    const previous: Registry = {
      ...createEmptyRegistry(2, '2026-01-01T00:00:00Z'),
      entries: {
        'weak-match': {
          ...BARE_ENTRY,
          semantic: {
            formcontrolname: 'customer',
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 2,
          locator_name: 'weakName'
        },
        'strong-match': {
          ...BARE_ENTRY,
          semantic: {
            formcontrolname: 'customer',
            aria_label: 'Customer',
            placeholder: 'Enter customer',
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 2,
          locator_name: 'strongName'
        }
      }
    };
    const incoming: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
      ...BARE_ENTRY,
      semantic: {
        formcontrolname: 'customer',
        aria_label: 'Customer',
        placeholder: 'Enter customer name',
        text_content: null,
        type: null
      }
    };
    const { merged } = mergeEntriesWithHistory({
      previous,
      history: new Map(),
      newEntries: { 'new-id': incoming },
      nextVersion: 3,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged['new-id']?.locator_name).toBe('strongName');
  });

  it('does not transfer when the removed donor has no locator_name to share', () => {
    const previous: Registry = {
      ...createEmptyRegistry(2, '2026-01-01T00:00:00Z'),
      entries: {
        'old-id': {
          ...BARE_ENTRY,
          semantic: {
            formcontrolname: 'customer',
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 2
          // no locator_name
        }
      }
    };
    const incoming: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
      ...BARE_ENTRY,
      semantic: {
        formcontrolname: 'customer',
        aria_label: 'Customer',
        placeholder: null,
        text_content: null,
        type: null
      }
    };
    const { merged } = mergeEntriesWithHistory({
      previous,
      history: new Map(),
      newEntries: { 'new-id': incoming },
      nextVersion: 3,
      now: '2026-04-17T10:00:00Z'
    });
    expect(merged['new-id']?.locator_name).toBeUndefined();
  });
});
