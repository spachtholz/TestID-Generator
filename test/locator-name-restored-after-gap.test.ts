import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import { mergeEntriesWithHistory } from '../src/registry/merge.js';
import { loadFullHistory } from '../src/registry/history.js';
import {
  createEmptyRegistry,
  type Registry,
  type RegistryEntry
} from '../src/registry/schema.js';

type IncomingEntry = Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>;

interface RunResult {
  registry: Registry;
  py: string;
}

function entry(overrides: Partial<IncomingEntry> & { fingerprint: string }): IncomingEntry {
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
    source: 'generated',
    ...overrides
  };
}

function variableFor(py: string, testid: string): string | null {
  const match = new RegExp(
    `(\\w+)\\s*=\\s*"[^"]*'${testid.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}'`
  ).exec(py);
  return match ? match[1]! : null;
}

describe('locator_name persistence across an absence gap', () => {
  let workDir = '';
  let registryDir = '';
  let outDir = '';

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-gap-'));
    registryDir = path.join(workDir, 'registry');
    outDir = path.join(workDir, 'locators');
    await fs.mkdir(registryDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  async function runCycle(args: {
    incoming: Record<string, IncomingEntry>;
    version: number;
    now: string;
  }): Promise<RunResult> {
    const history = await loadFullHistory(registryDir);
    const files = await fs.readdir(registryDir).catch(() => [] as string[]);
    const versioned = files
      .filter((f) => /^testids\.v\d+\.json$/.test(f))
      .map((f) => ({ name: f, v: Number(f.match(/v(\d+)/)![1]) }))
      .sort((a, b) => b.v - a.v);
    let previous: Registry | null = null;
    if (versioned[0]) {
      const raw = await fs.readFile(path.join(registryDir, versioned[0].name), 'utf8');
      previous = JSON.parse(raw) as Registry;
    }

    const { merged } = mergeEntriesWithHistory({
      previous,
      history,
      newEntries: args.incoming,
      nextVersion: args.version,
      now: args.now
    });
    const registry: Registry = {
      ...createEmptyRegistry(args.version, args.now),
      entries: merged
    };

    const snapshotPath = path.join(registryDir, `testids.v${args.version}.json`);
    await fs.writeFile(snapshotPath, JSON.stringify(registry, null, 2), 'utf8');
    const latestPath = path.join(registryDir, 'testids.latest.json');
    await fs.writeFile(latestPath, JSON.stringify(registry, null, 2), 'utf8');

    await generateLocators(registry, {
      outDir,
      registryPath: latestPath,
      lockNames: true,
      mode: 'merge'
    });
    const updated = JSON.parse(await fs.readFile(latestPath, 'utf8')) as Registry;
    // Mirror the locator_name writeback into the versioned snapshot so the
    await fs.writeFile(snapshotPath, JSON.stringify(updated, null, 2), 'utf8');

    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');
    return { registry: updated, py };
  }

  it('restores the locked locator_name after a one-version absence', async () => {
    const buttons = {
      'order__button--save-aaaa': entry({
        fingerprint: 'button|text=Save|event.click=saveAddress',
        semantic: {
          formcontrolname: null, aria_label: null, placeholder: null,
          text_content: 'Save', type: null,
          event_handlers: { click: 'saveAddress' }
        }
      }),
      'order__button--save-bbbb': entry({
        fingerprint: 'button|text=Save|event.click=saveBilling',
        semantic: {
          formcontrolname: null, aria_label: null, placeholder: null,
          text_content: 'Save', type: null,
          event_handlers: { click: 'saveBilling' }
        }
      }),
      'order__button--save-cccc': entry({
        fingerprint: 'button|text=Save|event.click=saveShipping',
        semantic: {
          formcontrolname: null, aria_label: null, placeholder: null,
          text_content: 'Save', type: null,
          event_handlers: { click: 'saveShipping' }
        }
      })
    };

    const r1 = await runCycle({ incoming: buttons, version: 1, now: '2026-05-01T00:00:00Z' });
    const v1Address = variableFor(r1.py, 'order__button--save-aaaa');
    const v1Billing = variableFor(r1.py, 'order__button--save-bbbb');
    const v1Shipping = variableFor(r1.py, 'order__button--save-cccc');
    expect(v1Address).toBe('order_nativeButton_save_saveAddress');
    expect(v1Billing).toBe('order_nativeButton_save_saveBilling');
    expect(v1Shipping).toBe('order_nativeButton_save_saveShipping');

    const r2 = await runCycle({
      incoming: { 'order__button--save-bbbb': buttons['order__button--save-bbbb'] },
      version: 2,
      now: '2026-05-02T00:00:00Z'
    });
    expect(variableFor(r2.py, 'order__button--save-bbbb')).toBe(v1Billing);
    expect(r2.py).not.toContain("'order__button--save-aaaa'");
    expect(r2.py).not.toContain("'order__button--save-cccc'");

    const r3 = await runCycle({ incoming: buttons, version: 3, now: '2026-05-03T00:00:00Z' });
    expect(variableFor(r3.py, 'order__button--save-aaaa')).toBe(v1Address);
    expect(variableFor(r3.py, 'order__button--save-bbbb')).toBe(v1Billing);
    expect(variableFor(r3.py, 'order__button--save-cccc')).toBe(v1Shipping);

    expect(r3.registry.entries['order__button--save-aaaa']!.first_seen_version).toBe(1);
    expect(r3.registry.entries['order__button--save-cccc']!.first_seen_version).toBe(1);
    expect(r3.registry.entries['order__button--save-aaaa']!.locator_name).toBe(v1Address);
    expect(r3.registry.entries['order__button--save-cccc']!.locator_name).toBe(v1Shipping);
  });

  it('numeric-suffix locators (_2, _3) keep their slot after an absence', async () => {
    const incoming1 = {
      'order__button--save-aaaa': entry({ fingerprint: 'fp-A' }),
      'order__button--save-bbbb': entry({ fingerprint: 'fp-B' })
    };
    const r1 = await runCycle({ incoming: incoming1, version: 1, now: '2026-05-01T00:00:00Z' });
    const v1A = variableFor(r1.py, 'order__button--save-aaaa');
    const v1B = variableFor(r1.py, 'order__button--save-bbbb');
    expect(v1A).toBe('order_nativeButton_save');
    expect(v1B).toBe('order_nativeButton_save_2');

    await runCycle({
      incoming: { 'order__button--save-bbbb': incoming1['order__button--save-bbbb'] },
      version: 2,
      now: '2026-05-02T00:00:00Z'
    });

    const r3 = await runCycle({ incoming: incoming1, version: 3, now: '2026-05-03T00:00:00Z' });
    expect(variableFor(r3.py, 'order__button--save-aaaa')).toBe(v1A);
    expect(variableFor(r3.py, 'order__button--save-bbbb')).toBe(v1B);
  });

  it('child_shape-driven compact suffix survives an absence gap', async () => {
    const baseSem = {
      formcontrolname: null, aria_label: null, placeholder: null,
      text_content: 'Card', type: null
    };
    const wrappers = {
      'order__div--card-aaaa': {
        component: 'src/order.component.html',
        tag: 'div',
        element_type: 'dom_div',
        fingerprint: 'div|text=Card|child_shape=h3:title-img:logo',
        semantic: { ...baseSem, child_shape: ['h3:title', 'img:logo'] },
        source: 'generated' as const
      },
      'order__div--card-bbbb': {
        component: 'src/order.component.html',
        tag: 'div',
        element_type: 'dom_div',
        fingerprint: 'div|text=Card|child_shape=h3:title-span:badge',
        semantic: { ...baseSem, child_shape: ['h3:title', 'span:badge'] },
        source: 'generated' as const
      }
    };
    const r1 = await runCycle({ incoming: wrappers, version: 1, now: '2026-05-01T00:00:00Z' });
    const v1A = variableFor(r1.py, 'order__div--card-aaaa');
    const v1B = variableFor(r1.py, 'order__div--card-bbbb');
    expect(v1A).toBe('order_domDiv_card_imgLogo');
    expect(v1B).toBe('order_domDiv_card_spanBadge');

    await runCycle({ incoming: {}, version: 2, now: '2026-05-02T00:00:00Z' });

    const r3 = await runCycle({ incoming: wrappers, version: 3, now: '2026-05-03T00:00:00Z' });
    expect(variableFor(r3.py, 'order__div--card-aaaa')).toBe(v1A);
    expect(variableFor(r3.py, 'order__div--card-bbbb')).toBe(v1B);
  });

  it('loadFullHistory exposes last_locator_name from the latest snapshot', async () => {
    const incoming = {
      'order__button--save': entry({ fingerprint: 'fp' })
    };
    await runCycle({ incoming, version: 1, now: '2026-05-01T00:00:00Z' });
    await runCycle({ incoming: {}, version: 2, now: '2026-05-02T00:00:00Z' });
    const history = await loadFullHistory(registryDir);
    const rec = history.get('order__button--save');
    expect(rec).toBeDefined();
    expect(rec!.last_locator_name).toBe('order_nativeButton_save');
    expect(rec!.first_seen_version).toBe(1);
  });

});
