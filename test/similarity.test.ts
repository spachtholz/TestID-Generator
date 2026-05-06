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
    // one edit in a 3-char string to 1 - 1/3
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

  it('flattens nested record fields to dotted paths instead of [object Object]', () => {
    // Prior to the fix, event_handlers / bound_identifiers / context were
    // stringified as `[object Object]`, collapsing the rename signal exactly
    // for the fields that distinguish two similar buttons.
    const s = serializeSemantics({
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: 'Save',
      type: null,
      event_handlers: { click: 'saveAddress', submit: 'submitOrder' },
      static_attributes: { severity: 'info' },
      context: {
        label_for: null,
        wrapper_label: null,
        fieldset_legend: 'Lieferadresse',
        preceding_heading: null,
        wrapper_formcontrolname: null,
        aria_labelledby_text: null
      }
    });
    expect(s).not.toContain('[object Object]');
    expect(s).toContain('event_handlers.click=saveAddress');
    expect(s).toContain('event_handlers.submit=submitOrder');
    expect(s).toContain('static_attributes.severity=info');
    expect(s).toContain('context.fieldset_legend=Lieferadresse');
    expect(s).toContain('text_content=Save');
  });

  it('flattens array fields with comma joins', () => {
    const s = serializeSemantics({
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: null,
      type: null,
      child_shape: ['h3:title', 'p:subtitle'],
      i18n_keys: ['save.button', 'cancel.button']
    });
    expect(s).toContain('child_shape=h3:title,p:subtitle');
    expect(s).toContain('i18n_keys=save.button,cancel.button');
  });
});

describe('entrySimilarity nested-record sensitivity', () => {
  it('two buttons with different click handlers are no longer "identical"', () => {
    // Pre-fix: both serialised to `event_handlers=[object Object]`, so the
    // similarity was 1.0 even though the handlers (and intent) differed.
    const a: RegistryEntry = {
      component: 'order.html',
      tag: 'button',
      element_type: 'native_button',
      fingerprint: 'fp-A',
      semantic: {
        formcontrolname: null,
        aria_label: null,
        placeholder: null,
        text_content: 'Save',
        type: null,
        event_handlers: { click: 'saveAddress' }
      },
      first_seen_version: 1,
      last_seen_version: 1
    };
    const b: RegistryEntry = {
      ...a,
      fingerprint: 'fp-B',
      semantic: { ...a.semantic, event_handlers: { click: 'saveBilling' } }
    };
    const score = entrySimilarity(a, b);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0.6); // still close - most fields match
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
