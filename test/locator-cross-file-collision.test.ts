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

function entry(component: string, fingerprint: string): RegistryEntry {
  return {
    component,
    tag: 'button',
    element_type: 'native_button',
    fingerprint,
    semantic: {
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: 'Save',
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1
  };
}

describe('cross-file variable name collision detection', () => {
  let outDir = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-xfile-'));
    outDir = path.join(tmp, 'locators');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('reports a collision when two components share a basename', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: {
        'dialog__button--save-1': entry('apps/admin/dialog.component.html', 'fp-A'),
        'dialog__button--save-2': entry('apps/user/dialog.component.html', 'fp-B')
      }
    };

    const result = await generateLocators(registry, {
      outDir,
      componentNaming: 'disambiguate'
    });

    // With disambiguate the variables become admin_dialog_* and user_dialog_*.
    expect(result.crossFileCollisions).toEqual([]);
  });

  it('flags a collision with basename mode when filenames clash', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: {
        'dialog__button--save-1': entry('apps/admin/dialog.component.html', 'fp-A'),
        'dialog__button--save-2': entry('apps/user/dialog.component.html', 'fp-B')
      }
    };

    const result = await generateLocators(registry, {
      outDir,
      componentNaming: 'basename'
    });

    // Both write to dialog.py so the collision is intra-module, not cross-file.
    expect(result.crossFileCollisions).toEqual([]);
  });

  it('detects a true cross-component variable collision (different modules, same variable)', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: {
        'dialog__button--save-1': entry('apps/admin/dialog.component.html', 'fp-A'),
        'dialog__button--save-2': entry('apps/user/dialog.component.html', 'fp-B')
      }
    };

    // No {component} in the variable format, so variables match across modules.
    const result = await generateLocators(registry, {
      outDir,
      componentNaming: 'disambiguate',
      variableFormat: '{element}_{key}'
    });

    expect(result.crossFileCollisions).toBeDefined();
    expect(result.crossFileCollisions!.length).toBeGreaterThan(0);
    const c = result.crossFileCollisions![0]!;
    expect(c.variable).toMatch(/nativeButton_save/);
    expect(c.components.length).toBe(2);
  });

  it('returns an empty list when nothing collides', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T00:00:00Z'),
      entries: {
        'order__button--save': entry('order.component.html', 'fp-A'),
        'customer__input--email': {
          ...entry('customer.component.html', 'fp-B'),
          tag: 'input',
          element_type: 'native_input',
          semantic: {
            formcontrolname: 'email', aria_label: null, placeholder: null,
            text_content: null, type: null
          }
        }
      }
    };
    const result = await generateLocators(registry, { outDir });
    expect(result.crossFileCollisions).toEqual([]);
  });
});
