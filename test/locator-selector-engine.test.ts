// Verifies the css/xpath selectorEngine switch end-to-end through
// generateLocators. CSS mode is the recommended setting for SeleniumLibrary
// + Browser Library; XPath stays the default for backwards compatibility.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import {
  createEmptyRegistry,
  type Registry,
  type RegistryEntry
} from '../src/registry/schema.js';

function entry(overrides: Partial<RegistryEntry> & { fingerprint: string }): RegistryEntry {
  return {
    component: 'src/order.component.html',
    tag: 'button',
    element_type: 'native_button',
    semantic: {
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: 'Save',
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1,
    ...overrides
  };
}

describe('selectorEngine option', () => {
  let outDir = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-selector-'));
    outDir = path.join(tmp, 'locators');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('default xpath: emits xpath://*[@data-testid=\'...\']', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: { 'order__button--save': entry({ fingerprint: 'fp' }) }
    };
    await generateLocators(registry, { outDir });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    expect(py).toContain("xpath://*[@data-testid='order__button--save']");
  });

  it('css mode: emits css=[data-testid=\'...\']', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: { 'order__button--save': entry({ fingerprint: 'fp' }) }
    };
    await generateLocators(registry, { outDir, selectorEngine: 'css' });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    expect(py).toContain("css=[data-testid='order__button--save']");
    expect(py).not.toContain('xpath:');
  });

  it('css mode honours custom cssPrefix (empty string for no prefix)', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: { 'order__button--save': entry({ fingerprint: 'fp' }) }
    };
    await generateLocators(registry, { outDir, selectorEngine: 'css', cssPrefix: '' });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    // Bare attribute selector - Robot's Browser Library auto-detects css.
    expect(py).toContain("[data-testid='order__button--save']");
    expect(py).not.toContain('css=');
  });

  it('css mode pairs with custom attributeName (e.g. data-cy)', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: { 'order__button--save': entry({ fingerprint: 'fp' }) }
    };
    await generateLocators(registry, {
      outDir,
      selectorEngine: 'css',
      attributeName: 'data-cy'
    });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    expect(py).toContain("css=[data-cy='order__button--save']");
  });

  it('css mode does not break the merge round-trip (still classifies as managed)', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: { 'order__button--save': entry({ fingerprint: 'fp' }) }
    };
    await generateLocators(registry, { outDir, selectorEngine: 'css', mode: 'merge' });
    // Re-run with a different mode-flag should still match the existing
    // line via its data-testid attribute.
    const v2: Registry = {
      ...createEmptyRegistry(2, '2026-05-06T00:00:00Z'),
      entries: { 'order__button--save': entry({ fingerprint: 'fp' }) }
    };
    await generateLocators(v2, { outDir, selectorEngine: 'css', mode: 'merge' });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    // Exactly one managed line for the testid.
    const matches = py.match(/order__button--save/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
