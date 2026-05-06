// Locator-generator must not silently emit two lines that share the same
// Python variable name - Robot would only see the last one. Collisions
// are detected during module build and a stable `_2`/`_3` suffix is
// appended in deterministic testid order.

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
    // Two distinct testids - but the default variableFormat
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
    // to '--save'    keeps the bare name
    // to '--save--2' becomes _2 (the first collision)
    // to '--save--3' becomes _3 (the second collision)
    expect(content).toContain("order_nativeButton_save = \"xpath://*[@data-testid='order__button--save']\"");
    expect(content).toContain("order_nativeButton_save_2 = \"xpath://*[@data-testid='order__button--save--2']\"");
    expect(content).toContain("order_nativeButton_save_3 = \"xpath://*[@data-testid='order__button--save--3']\"");
  });

  it('uses surrounding-context as the readable {key} instead of falling back to text_content', async () => {
    // Two buttons with text "Speichern" but distinct surrounding context
    // (different fieldset legends). text_content is identical; the
    // surrounding-context fields distinguish them. The locator-gen
    // primary-key picker walks the same priority list as the tagger and
    // picks the legend, producing readable variables instead of `_2`/`_3`.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--auftraggeber-3a3a3a': {
          component: 'src/order.component.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'button|context.fieldset_legend=Auftraggeber|text=Speichern',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Speichern',
            type: null,
            context: {
              label_for: null,
              wrapper_label: null,
              fieldset_legend: 'Auftraggeber',
              preceding_heading: null,
              wrapper_formcontrolname: null,
              aria_labelledby_text: null
            }
          },
          first_seen_version: 1,
          last_seen_version: 1
        },
        'order__button--bestellung-7b7b7b': {
          component: 'src/order.component.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'button|context.fieldset_legend=Bestellung|text=Speichern',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Speichern',
            type: null,
            context: {
              label_for: null,
              wrapper_label: null,
              fieldset_legend: 'Bestellung',
              preceding_heading: null,
              wrapper_formcontrolname: null,
              aria_labelledby_text: null
            }
          },
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };
    await generateLocators(registry, { outDir: dir });
    const content = await fs.readFile(path.join(dir, 'order.py'), 'utf8');
    // Both variables must be readable, distinct, and NOT use `_2`/`_3`.
    expect(content).toMatch(/^order_nativeButton_auftraggeber\s*=/m);
    expect(content).toMatch(/^order_nativeButton_bestellung\s*=/m);
    expect(content).not.toMatch(/_2\b/);
  });

  it('does nothing when the variableFormat is already unique', async () => {
    // {testid} guarantees uniqueness - collision-handler should be a no-op.
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
