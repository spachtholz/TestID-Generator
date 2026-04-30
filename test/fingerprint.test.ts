import { describe, it, expect } from 'vitest';
import { parseAngularTemplate, walkElements, isElement, type VisitedElement } from '../src/tagger/template-parser.js';
import { generateFingerprint } from '../src/tagger/fingerprint-generator.js';

function firstElement(source: string, tagName: string): VisitedElement {
  const parsed = parseAngularTemplate(source);
  let found: VisitedElement | null = null;
  walkElements(parsed.ast, (el) => {
    if (found) return;
    if (isElement(el) && (el as { name?: string }).name === tagName) {
      found = el;
    }
  });
  if (!found) throw new Error(`No <${tagName}> in source`);
  return found;
}

describe('generateFingerprint', () => {
  it('prefers formcontrolname over placeholder (FR-1.6)', () => {
    const el = firstElement(
      `<input formcontrolname="email" placeholder="Your email" type="email" />`,
      'input'
    );
    const fp = generateFingerprint(el);
    expect(fp.primaryKey).toBe('formcontrolname');
    expect(fp.primaryValue).toBe('email');
    expect(fp.fingerprint).toBe('input|formcontrolname=email|placeholder=Your email|type=email');
  });

  it('falls back to static text when nothing else is present', () => {
    const el = firstElement(`<button>Save</button>`, 'button');
    const fp = generateFingerprint(el);
    expect(fp.primaryKey).toBe('text');
    expect(fp.primaryValue).toBe('Save');
  });

  it('extracts the bound identifier from a `{{ varName }}` interpolation (Tier 5)', () => {
    // Pre-Tier-5 the fingerprint had no access to bound text — every
    // `{{ … }}` template button collided. Tier 5 surfaces the variable name
    // (or i18n key, see other tests) so distinct buttons get distinct keys.
    const el = firstElement(`<button>{{ saveLabel }}</button>`, 'button');
    const fp = generateFingerprint(el);
    expect(fp.primaryKey).toBe('bound_text_path');
    expect(fp.primaryValue).toBe('saveLabel');
  });

  it('produces a deterministic fingerprint string', () => {
    const el1 = firstElement(
      `<p-dropdown placeholder="Kunde wählen" formcontrolname="customer"></p-dropdown>`,
      'p-dropdown'
    );
    const el2 = firstElement(
      `<p-dropdown formcontrolname="customer" placeholder="Kunde wählen"></p-dropdown>`,
      'p-dropdown'
    );
    expect(generateFingerprint(el1).fingerprint).toBe(generateFingerprint(el2).fingerprint);
  });
});
