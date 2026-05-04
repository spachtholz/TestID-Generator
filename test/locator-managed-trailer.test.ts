// Two related extensions to the # testid-managed comment:
//   1) `includeGeneratedDate` appends `| YYYY-MM-DD` from `last_generated_at`
//      so reviewers can see at a glance which locators changed last.
//   2) `collisionSuffix: 'hash'` swaps the legacy `_2`/`_3` last-resort suffix
//      for a 4-char fingerprint hash that is stable across runs and
//      independent of iteration order.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import {
  classifyLocatorLine,
  mergeLocatorModule
} from '../src/locators/merge.js';
import {
  createEmptyRegistry,
  type Registry,
  type RegistryEntry
} from '../src/registry/schema.js';

const ATTR = 'data-testid';

function baseEntry(overrides: Partial<RegistryEntry> & { fingerprint: string }): RegistryEntry {
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

describe('includeGeneratedDate', () => {
  let outDir = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-trailer-'));
    outDir = path.join(tmp, 'locators');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('emits the date suffix from last_generated_at', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          last_generated_at: '2026-05-05T10:00:00Z'
        })
      }
    };

    await generateLocators(registry, { outDir, includeGeneratedDate: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toMatch(/# testid-managed \| 2026-05-05$/m);
  });

  it('omits the trailer when last_generated_at is missing', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({ fingerprint: 'fp-A' })
      }
    };

    await generateLocators(registry, { outDir, includeGeneratedDate: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    // The bare marker survives when no date is present so the merge step still
    // recognises the line.
    expect(py).toMatch(/# testid-managed$/m);
    expect(py).not.toMatch(/# testid-managed \|/m);
  });

  it('default (off) keeps the legacy bare marker', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          last_generated_at: '2026-05-05T10:00:00Z'
        })
      }
    };

    await generateLocators(registry, { outDir });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toMatch(/# testid-managed$/m);
    expect(py).not.toContain('2026-05-05');
  });

  it('classifyLocatorLine recognises both bare and dated trailers', () => {
    const bare =
      "x = \"xpath://*[@data-testid='a']\"  # testid-managed";
    const dated =
      "y = \"xpath://*[@data-testid='b']\"  # testid-managed | 2026-05-05";
    expect(classifyLocatorLine(bare, ATTR).kind).toBe('managed');
    const r = classifyLocatorLine(dated, ATTR);
    expect(r.kind).toBe('managed');
    if (r.kind === 'managed') expect(r.testid).toBe('b');
  });

  it('merge replaces a stale date with the current one', async () => {
    const existing =
      "order_nativeButton_save = \"xpath://*[@data-testid='order__button--save-aaaa']\"  # testid-managed | 2025-01-01\n";

    const registry: Registry = {
      ...createEmptyRegistry(2, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          last_generated_at: '2026-05-05T10:00:00Z'
        })
      }
    };

    // Seed an existing file so merge mode is exercised.
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'order.py'), existing, 'utf8');

    await generateLocators(registry, {
      outDir,
      includeGeneratedDate: true,
      mode: 'merge'
    });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('| 2026-05-05');
    expect(py).not.toContain('| 2025-01-01');
  });

  it('round-trips through mergeLocatorModule via the helper API', () => {
    const fresh = {
      component: 'order',
      filename: 'order.py',
      entries: [
        {
          variable: 'order_btn_save',
          selector: "xpath://*[@data-testid='a']",
          testid: 'a',
          lastGeneratedDate: '2026-05-05'
        }
      ]
    };
    const out = mergeLocatorModule({
      existingSource: '',
      freshModule: fresh,
      attributeName: ATTR
    });
    expect(out).toContain('# testid-managed | 2026-05-05');
  });
});

describe('collisionSuffix: hash', () => {
  let outDir = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-suffix-'));
    outDir = path.join(tmp, 'locators');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('replaces _2/_3 with a stable fingerprint-hash suffix when nothing else can split the group', async () => {
    // Byte-identical semantic snapshots — only the testid hash and
    // fingerprint differ. Numeric mode would emit `_2` for the second one.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({ fingerprint: 'fp-A' }),
        'order__button--save-bbbb': baseEntry({ fingerprint: 'fp-B' })
      }
    };

    await generateLocators(registry, {
      outDir,
      lockNames: true,
      collisionSuffix: 'hash'
    });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).not.toMatch(/order_nativeButton_save_2\b/);
    // Two managed lines, both with `_<hex4>` suffix — hex hashes have no
    // `_2`/`_3`-style trailing digit run alone, so the regex below is safe.
    const hashSuffixed = py.match(/order_nativeButton_save_[0-9a-f]{4}\b/g);
    expect(hashSuffixed?.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the same hash suffix when a colliding peer is added later', async () => {
    // First run: just A. Second run: add B. With numeric, A would risk `_2`
    // appearing on B and shuffling whenever ordering changes. With hash mode
    // the suffix is bound to the entry's own fingerprint and never moves.
    const v1: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({ fingerprint: 'fp-A' })
      }
    };

    await generateLocators(v1, { outDir, collisionSuffix: 'hash' });
    const after1 = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    const aLine1 = after1
      .split('\n')
      .find((l) => l.includes("data-testid='order__button--save-aaaa'"));
    expect(aLine1).toBeDefined();

    const v2: Registry = {
      ...createEmptyRegistry(2, '2026-05-06T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({ fingerprint: 'fp-A' }),
        'order__button--save-bbbb': baseEntry({ fingerprint: 'fp-B' })
      }
    };
    await generateLocators(v2, {
      outDir,
      collisionSuffix: 'hash',
      mode: 'merge'
    });
    const after2 = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    const aLine2 = after2
      .split('\n')
      .find((l) => l.includes("data-testid='order__button--save-aaaa'"));

    // A's variable name must not have changed — same fingerprint, same hash.
    const aVar1 = aLine1!.split(' ')[0];
    const aVar2 = aLine2!.split(' ')[0];
    expect(aVar2).toBe(aVar1);
  });

  it('preserves the semantic-discriminator path when the group can be split semantically', async () => {
    // hash mode is only the LAST-RESORT fallback; semantic discrimination
    // still wins when it can.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveAddress' }
          }
        }),
        'order__button--save-bbbb': baseEntry({
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveBilling' }
          }
        })
      }
    };

    await generateLocators(registry, {
      outDir,
      lockNames: true,
      collisionSuffix: 'hash'
    });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('order_nativeButton_save_saveAddress');
    expect(py).toContain('order_nativeButton_save_saveBilling');
    expect(py).not.toMatch(/order_nativeButton_save_[0-9a-f]{4}\b/);
  });
});
