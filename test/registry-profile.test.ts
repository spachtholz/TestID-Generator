import { describe, it, expect } from 'vitest';
import {
  applyRegistryProfile,
  resolveRegistryOptions
} from '../src/registry/serialization.js';
import { createEmptyRegistry, type Registry, type RegistryEntry } from '../src/registry/schema.js';

function fullEntry(): RegistryEntry {
  return {
    component: 'src/app/hello.component.html',
    tag: 'button',
    element_type: 'native_button',
    fingerprint: 'button|text=Send',
    semantic: {
      formcontrolname: 'send',
      name: null,
      routerlink: null,
      aria_label: 'Send the form',
      placeholder: null,
      text_content: 'Send',
      type: 'submit',
      role: null
    },
    dynamic_children: null,
    source: 'generated',
    first_seen_version: 1,
    last_seen_version: 3,
    last_generated_at: '2026-04-18T12:00:00Z',
    generation_history: [1, 3]
  };
}

function buildRegistry(entry: RegistryEntry): Registry {
  return {
    ...createEmptyRegistry(3, '2026-04-18T12:00:00Z'),
    entries: { 'hello__button--send': entry }
  };
}

describe('resolveRegistryOptions', () => {
  it('falls back to full profile when nothing is set', () => {
    const r = resolveRegistryOptions(undefined);
    expect(r.includeSemantics).toBe(true);
    expect(r.includeHistory).toBe(true);
    expect(r.includeSource).toBe(true);
    expect(r.includeDynamicChildren).toBe(true);
    expect(r.semanticFields.length).toBeGreaterThan(0);
  });

  it('applies minimal profile', () => {
    const r = resolveRegistryOptions({ profile: 'minimal' });
    expect(r.includeSemantics).toBe(false);
    expect(r.includeHistory).toBe(false);
    expect(r.includeSource).toBe(false);
    expect(r.includeDynamicChildren).toBe(false);
    expect(r.semanticFields).toEqual([]);
  });

  it('lets sibling overrides win over the profile baseline', () => {
    const r = resolveRegistryOptions({
      profile: 'standard',
      includeHistory: true,
      semanticFields: ['aria_label']
    });
    expect(r.includeHistory).toBe(true); // overridden
    expect(r.includeSemantics).toBe(true); // from standard baseline
    expect(r.semanticFields).toEqual(['aria_label']);
  });
});

describe('applyRegistryProfile', () => {
  it('keeps only required fields under minimal', () => {
    const reg = buildRegistry(fullEntry());
    const out = applyRegistryProfile(reg, resolveRegistryOptions({ profile: 'minimal' }));
    const entry = out.entries['hello__button--send']!;
    expect(entry.source).toBeUndefined();
    expect(entry.dynamic_children).toBeUndefined();
    expect(entry.last_generated_at).toBeUndefined();
    expect(entry.generation_history).toBeUndefined();
    expect(entry.semantic).toEqual({});
    // required stays
    expect(entry.component).toBe('src/app/hello.component.html');
    expect(entry.fingerprint).toBe('button|text=Send');
  });

  it('keeps standard fields under standard', () => {
    const reg = buildRegistry(fullEntry());
    const out = applyRegistryProfile(reg, resolveRegistryOptions({ profile: 'standard' }));
    const entry = out.entries['hello__button--send']!;
    expect(entry.source).toBe('generated');
    expect(entry.dynamic_children).toBeNull();
    expect(entry.last_generated_at).toBeUndefined();
    expect(entry.generation_history).toBeUndefined();
    expect(entry.semantic.aria_label).toBe('Send the form');
    expect(entry.semantic.text_content).toBe('Send');
    // Fields not in the standard semanticFields list are dropped or nulled.
    // Required schema fields stay as null; optional ones drop off entirely.
    expect(entry.semantic.role).toBeUndefined();
    expect(entry.semantic.type).toBeNull();
  });

  it('full profile is byte-identical to the input for all optional fields', () => {
    const reg = buildRegistry(fullEntry());
    const out = applyRegistryProfile(reg, resolveRegistryOptions({ profile: 'full' }));
    const entry = out.entries['hello__button--send']!;
    expect(entry.source).toBe('generated');
    expect(entry.last_generated_at).toBe('2026-04-18T12:00:00Z');
    expect(entry.generation_history).toEqual([1, 3]);
  });

  it('semanticFields override restricts sub-keys under standard', () => {
    const reg = buildRegistry(fullEntry());
    const out = applyRegistryProfile(
      reg,
      resolveRegistryOptions({ profile: 'standard', semanticFields: ['aria_label'] })
    );
    const entry = out.entries['hello__button--send']!;
    expect(Object.keys(entry.semantic).sort()).toContain('aria_label');
    // Fields not in the override list should be absent or null, not carry real values.
    expect(entry.semantic.text_content).toBeFalsy();
  });
});
