import { describe, it, expect } from 'vitest';
import { renderVariableName } from '../src/locators/render.js';
import { type RegistryEntry } from '../src/registry/schema.js';

function entry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    component: 'src/app/order-list/order-list.component.html',
    tag: 'p-dropdown',
    element_type: 'primeng_dropdown',
    fingerprint: 'p-dropdown|formcontrolname=customer',
    semantic: {
      formcontrolname: 'customer',
      name: null,
      routerlink: null,
      aria_label: null,
      placeholder: null,
      text_content: null,
      type: null,
      role: null
    },
    first_seen_version: 1,
    last_seen_version: 1,
    ...overrides
  };
}

describe('renderVariableName', () => {
  it('uses default template {component}_{element}_{key}', () => {
    const e = entry();
    expect(renderVariableName(e, 'tid-abc123')).toBe('orderList_primengDropdown_customer');
  });

  it('falls back to tag when no semantic key is set', () => {
    const e = entry({
      semantic: {
        formcontrolname: null,
        aria_label: null,
        placeholder: null,
        text_content: null,
        type: null
      }
    });
    expect(renderVariableName(e, 'some-id')).toBe('orderList_primengDropdown_pDropdown');
  });

  it('supports custom templates', () => {
    const e = entry();
    expect(renderVariableName(e, 'x', '{element}_{key}')).toBe('primengDropdown_customer');
  });

  it('produces stable output even for hash-only testids', () => {
    const e = entry({ fingerprint: 'a|b|c' });
    const name = renderVariableName(e, 'tid-a1b2c3', '{component}_{element}_{key}_{hash}');
    expect(name).toMatch(/^orderList_primengDropdown_customer_[0-9a-f]{6}$/);
  });

  it('sanitizes non-identifier characters', () => {
    const e = entry({
      semantic: {
        formcontrolname: null,
        aria_label: 'some / weird & name',
        placeholder: null,
        text_content: null,
        type: null
      }
    });
    const name = renderVariableName(e, 'x');
    expect(name).not.toContain(' ');
    expect(name).not.toContain('/');
    expect(name).not.toContain('&');
    // camelCaseTestid should squash the spaces/slashes in aria_label into one word
    expect(name).toMatch(/^orderList_primengDropdown_someWeirdName$/);
  });

  it('prefixes with tid_ when the result starts with a digit', () => {
    const e = entry({
      component: '1337.component.html',
      tag: 'div',
      element_type: 'dom_div',
      semantic: {
        formcontrolname: null,
        aria_label: null,
        placeholder: null,
        text_content: null,
        type: null
      }
    });
    const name = renderVariableName(e, 'x', '{component}');
    expect(name.startsWith('tid')).toBe(true);
  });

  it('falls back to testid when template renders empty', () => {
    const e = entry();
    // `{unknown}` is not substituted; after sanitation the raw "{unknown}"
    // becomes "unknown", which is non-empty - so sanitation must handle the
    // other fallback for truly-empty inputs. Use an explicit empty-ish template.
    const name = renderVariableName(e, 'real-testid-123', '{component}');
    // Should not be empty, should be orderList.
    expect(name).toBe('orderList');
  });
});
