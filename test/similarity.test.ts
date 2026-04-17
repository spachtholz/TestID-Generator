import { describe, it, expect } from 'vitest';
import {
  levenshtein,
  similarityScore,
  serializeSemantics,
  entrySimilarity
} from '../src/differ/similarity.js';
import type { RegistryEntry } from '@testid/registry';

describe('levenshtein', () => {
  it('classic cases', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('similarityScore', () => {
  it('returns 1.0 for identical strings', () => {
    expect(similarityScore('foo', 'foo')).toBe(1);
  });

  it('decays linearly with distance', () => {
    // one edit in a 3-char string → 1 - 1/3
    expect(similarityScore('foo', 'fox')).toBeCloseTo(2 / 3, 10);
  });
});

describe('serializeSemantics', () => {
  it('emits sorted key=value segments, skipping null/empty', () => {
    const s = serializeSemantics({
      formcontrolname: 'customer',
      placeholder: 'Kunde wählen',
      aria_label: null,
      text_content: '',
      type: null
    });
    expect(s).toBe('formcontrolname=customer|placeholder=Kunde wählen');
  });
});

function entry(id: string, overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    component: 'c.html',
    tag: 'p-dropdown',
    element_type: 'primeng_dropdown',
    fingerprint: 'fp',
    semantic: {
      formcontrolname: 'customer',
      placeholder: 'Kunde wählen',
      aria_label: null,
      text_content: null,
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1,
    ...overrides
  };
}

describe('entrySimilarity', () => {
  it('is 1.0 (capped) for identical semantics + same tag', () => {
    const a = entry('a');
    const b = entry('b');
    expect(entrySimilarity(a, b)).toBe(1);
  });

  it('is high (>0.8) when only one attribute changed + tag differs slightly', () => {
    const a = entry('a', { tag: 'p-dropdown' });
    const b = entry('b', {
      tag: 'p-select',
      semantic: {
        formcontrolname: 'customer',
        placeholder: 'Kunde wählen',
        aria_label: null,
        text_content: null,
        type: null
      }
    });
    expect(entrySimilarity(a, b)).toBeGreaterThanOrEqual(0.9);
  });
});
