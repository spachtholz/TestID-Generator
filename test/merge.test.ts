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
});
