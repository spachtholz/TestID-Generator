// Locator-name stability under lockNames: when two entries produce the same
// bare variable, the disambiguated form (`save`, `save_2`) must be persisted
// back to the registry. A new colliding entry on a subsequent run then takes
// the next free slot (`save_3`) instead of stealing `save` from the first
// already-locked entry.

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

function makeEntry(overrides: Partial<RegistryEntry> & { fingerprint: string }): RegistryEntry {
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

describe('locator-name stability under lockNames', () => {
  let outDir = '';
  let registryPath = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-locname-'));
    outDir = path.join(tmp, 'locators');
    registryPath = path.join(tmp, 'testids.latest.json');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('writes the disambiguated variable back to locator_name on first run', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': makeEntry({ fingerprint: 'fp-A' }),
        'order__button--save-bbbb': makeEntry({ fingerprint: 'fp-B' })
      }
    };

    await fs.writeFile(registryPath, JSON.stringify(registry), 'utf8');
    const result = await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: true
    });

    expect(result.registryWritten).toBe(true);
    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save'
    );
    expect(registry.entries['order__button--save-bbbb']!.locator_name).toBe(
      'order_nativeButton_save_2'
    );
  });

  it('is a no-op on a second identical run (no registry rewrite)', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': makeEntry({
          fingerprint: 'fp-A',
          locator_name: 'order_nativeButton_save'
        }),
        'order__button--save-bbbb': makeEntry({
          fingerprint: 'fp-B',
          locator_name: 'order_nativeButton_save_2'
        })
      }
    };

    const result = await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: true
    });

    expect(result.registryWritten).toBeFalsy();
    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save'
    );
    expect(registry.entries['order__button--save-bbbb']!.locator_name).toBe(
      'order_nativeButton_save_2'
    );
  });

  it('keeps locked names stable when a new colliding entry arrives with a smaller testid', async () => {
    // Two entries already locked from a prior run. Then a third entry arrives
    // whose bare name is the same and whose testid sorts BEFORE both. Without
    // frozen-first the old `_save` slot would be stolen by the newcomer.
    const registry: Registry = {
      ...createEmptyRegistry(2, '2026-04-17T11:00:00Z'),
      entries: {
        'order__button--save-mmmm': makeEntry({
          fingerprint: 'fp-mid',
          locator_name: 'order_nativeButton_save'
        }),
        'order__button--save-zzzz': makeEntry({
          fingerprint: 'fp-late',
          locator_name: 'order_nativeButton_save_2'
        }),
        'order__button--save-aaaa': makeEntry({
          fingerprint: 'fp-early'
          // no locator_name yet — newly arrived
        })
      }
    };

    const result = await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: true
    });

    expect(result.registryWritten).toBe(true);

    // Old locked entries keep their slots.
    expect(registry.entries['order__button--save-mmmm']!.locator_name).toBe(
      'order_nativeButton_save'
    );
    expect(registry.entries['order__button--save-zzzz']!.locator_name).toBe(
      'order_nativeButton_save_2'
    );
    // Newcomer goes to the next free slot, NOT to the bare `save` even though
    // its testid sorts first.
    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save_3'
    );

    // The .py file must reflect the same assignment so Robot reads it the
    // same way the registry advertises.
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    expect(py).toContain(
      "order_nativeButton_save = \"xpath://*[@data-testid='order__button--save-mmmm']\""
    );
    expect(py).toContain(
      "order_nativeButton_save_2 = \"xpath://*[@data-testid='order__button--save-zzzz']\""
    );
    expect(py).toContain(
      "order_nativeButton_save_3 = \"xpath://*[@data-testid='order__button--save-aaaa']\""
    );
  });

  it('regenerate mode reconciles disambiguated names cleanly', async () => {
    // User changed variableFormat — regenerate=true forces every entry's
    // locator_name back to the bare expected. The writeback then makes the
    // disambiguated form (`save_2`) authoritative again.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': makeEntry({
          fingerprint: 'fp-A',
          locator_name: 'stale_old_name_a'
        }),
        'order__button--save-bbbb': makeEntry({
          fingerprint: 'fp-B',
          locator_name: 'stale_old_name_b'
        })
      }
    };

    await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: true,
      regenerateNames: true
    });

    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save'
    );
    expect(registry.entries['order__button--save-bbbb']!.locator_name).toBe(
      'order_nativeButton_save_2'
    );
  });

  it('does not mutate the registry when lockNames is off', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': makeEntry({ fingerprint: 'fp-A' }),
        'order__button--save-bbbb': makeEntry({ fingerprint: 'fp-B' })
      }
    };

    const result = await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: false
    });

    expect(result.registryWritten).toBeFalsy();
    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBeUndefined();
    expect(registry.entries['order__button--save-bbbb']!.locator_name).toBeUndefined();
  });

  it('persists the locator_name even for singleton (uncollided) entries', async () => {
    // Singletons should also have their bare name written back so the next
    // run sees them as frozen, not as fresh-bare-collide-able entries.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': makeEntry({ fingerprint: 'fp-A' })
      }
    };

    const result = await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: true
    });

    expect(result.registryWritten).toBe(true);
    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save'
    );
  });
});
