import { describe, it, expect } from 'vitest';
import {
  generateId,
  kebab,
  componentNameFromPath,
  hashFingerprint
} from '../src/tagger/id-generator.js';

describe('kebab', () => {
  it('lowercases + replaces non-alnum with dashes', () => {
    expect(kebab('Customer Name!')).toBe('customer-name');
  });

  it('transliterates German umlauts to ae/oe/ue/ss', () => {
    expect(kebab('Kunde wählen')).toBe('kunde-waehlen');
    expect(kebab('Größe')).toBe('groesse');
    expect(kebab('Über uns')).toBe('ueber-uns');
    expect(kebab('Adresse straße')).toBe('adresse-strasse');
  });

  it('strips non-German Latin diacritics down to the base letter', () => {
    expect(kebab('Café')).toBe('cafe');
    expect(kebab('niño')).toBe('nino');
    expect(kebab('façade')).toBe('facade');
  });

  it('splits camelCase', () => {
    expect(kebab('orderFormComponent')).toBe('order-form-component');
  });

  it('returns "unknown" for empty input', () => {
    expect(kebab('')).toBe('unknown');
    expect(kebab('---')).toBe('unknown');
  });
});

describe('componentNameFromPath', () => {
  it('strips .component.html suffix', () => {
    expect(componentNameFromPath('src/app/order-form/order-form.component.html')).toBe('order-form');
  });
});

describe('generateId', () => {
  it('follows the FR-1.7 format', () => {
    expect(
      generateId({
        componentName: 'login',
        elementType: 'input',
        primaryValue: 'email',
        tag: 'input',
        fingerprint: 'input|formcontrolname=email',
        needsHashSuffix: false
      })
    ).toBe('login__input--email');
  });

  it('appends hash6 when semantic key is missing', () => {
    const id = generateId({
      componentName: 'user-list',
      elementType: 'button',
      primaryValue: null,
      tag: 'button',
      fingerprint: 'button|position=7',
      needsHashSuffix: true
    });
    expect(id).toMatch(/^user-list__button--button-[0-9a-f]{6}$/);
  });

  it('hashFingerprint is deterministic + 6 hex chars', () => {
    const h = hashFingerprint('p-dropdown|formcontrolname=customer');
    expect(h).toMatch(/^[0-9a-f]{6}$/);
    expect(h).toBe(hashFingerprint('p-dropdown|formcontrolname=customer'));
  });
});
