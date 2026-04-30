// Locator-generator must not silently emit two lines that share the same
// Python variable name — Robot would only see the last one. Tier-D fix:
// detect collisions during module build and append a stable `_2/_3` suffix.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import { createEmptyRegistry, type Registry, type RegistryEntry } from '../src/registry/schema.js';

function entry(overrides: Partial<RegistryEntry> & { component: string }): RegistryEntry {
  return {
    component: overrides.component,
    tag: 'button',
    element_type: 'native_button',
    fingerprint: 'button|text=Save',
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

describe('locator variable-name collision handling', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-loc-collision-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('appends _2/_3 when two entries produce the same variable', async () => {
    // Two distinct testids — but the default variableFormat
    // {component}_{element}_{key} produces the same Python identifier for
    // both because the key (text_content="Save") is identical. Without
    // disambiguation Robot would only see the second line.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save': entry({
          component: 'src/order.component.html'
        }),
        'order__button--save--2': entry({
          component: 'src/order.component.html'
        })
      }
    };
    await generateLocators(registry, { outDir: dir });
    const content = await fs.readFile(path.join(dir, 'order.py'), 'utf8');

    // Both variables must be present on distinct lines.
    expect(content).toMatch(/^order_nativeButton_save\s*=/m);
    expect(content).toMatch(/^order_nativeButton_save_2\s*=/m);

    // Each must point at the right testid.
    expect(content).toContain("order_nativeButton_save = \"xpath://*[@data-testid='order__button--save']\"");
    expect(content).toContain("order_nativeButton_save_2 = \"xpath://*[@data-testid='order__button--save--2']\"");
  });

  it('keeps the first-claim variable stable in deterministic testid order', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save--2': entry({ component: 'order.component.html' }),
        'order__button--save': entry({ component: 'order.component.html' }),
        'order__button--save--3': entry({ component: 'order.component.html' })
      }
    };
    await generateLocators(registry, { outDir: dir });
    const content = await fs.readFile(path.join(dir, 'order.py'), 'utf8');

    // Sorted by testid: '--save', '--save--2', '--save--3'
    // → '--save'    keeps the bare name
    // → '--save--2' becomes _2 (the first collision)
    // → '--save--3' becomes _3 (the second collision)
    expect(content).toContain("order_nativeButton_save = \"xpath://*[@data-testid='order__button--save']\"");
    expect(content).toContain("order_nativeButton_save_2 = \"xpath://*[@data-testid='order__button--save--2']\"");
    expect(content).toContain("order_nativeButton_save_3 = \"xpath://*[@data-testid='order__button--save--3']\"");
  });

  it('does nothing when the variableFormat is already unique', async () => {
    // {testid} guarantees uniqueness — collision-handler should be a no-op.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save': entry({ component: 'order.component.html' }),
        'order__button--save--2': entry({ component: 'order.component.html' })
      }
    };
    await generateLocators(registry, {
      outDir: dir,
      variableFormat: '{testid}'
    });
    const content = await fs.readFile(path.join(dir, 'order.py'), 'utf8');
    expect(content).toContain('orderButtonSave = ');
    expect(content).toContain('orderButtonSave2 = ');
    // none of our `_2`/`_3` collision suffixes should appear
    expect(content).not.toMatch(/orderButtonSave_2\b/);
  });
});
