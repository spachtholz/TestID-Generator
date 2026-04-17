import { describe, it, expect } from 'vitest';
import { generateId, DEFAULT_ID_FORMAT } from '../src/tagger/id-generator.js';

const base = {
  componentName: 'order-form',
  elementType: 'button' as const,
  primaryValue: 'submit',
  tag: 'button',
  fingerprint: 'button|text=Submit',
  needsHashSuffix: false
};

describe('idFormat template', () => {
  it('uses the historical layout as default', () => {
    expect(generateId(base)).toBe('order-form__button--submit');
    expect(DEFAULT_ID_FORMAT).toBe('{component}__{element}--{key}{hash:-}');
  });

  it('substitutes every known placeholder', () => {
    const id = generateId({
      ...base,
      idFormat: '{component}.{element}.{key}.{tag}'
    });
    expect(id).toBe('order-form.button.submit.button');
  });

  it('emits the hash only when a collision forces it', () => {
    const noHash = generateId({ ...base, idFormat: 'tid-{component}-{key}{hash:-}' });
    expect(noHash).toBe('tid-order-form-submit');
    const withHash = generateId({
      ...base,
      needsHashSuffix: true,
      idFormat: 'tid-{component}-{key}{hash:-}'
    });
    expect(withHash.startsWith('tid-order-form-submit-')).toBe(true);
    expect(withHash.length).toBeGreaterThan('tid-order-form-submit-'.length);
  });

  it('renders unknown placeholders verbatim', () => {
    const id = generateId({ ...base, idFormat: '{component}-{missing}-{key}' });
    expect(id).toBe('order-form-{missing}-submit');
  });

  it('falls back to kebab(tag) when no primary value is available', () => {
    const id = generateId({
      ...base,
      primaryValue: null,
      idFormat: '{component}-{key}'
    });
    expect(id).toBe('order-form-button');
  });
});
