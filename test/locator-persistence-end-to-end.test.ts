import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import { mergeEntriesWithHistory } from '../src/registry/merge.js';
import {
  createEmptyRegistry,
  type Registry,
  type RegistryEntry
} from '../src/registry/schema.js';
import type { HistoryMap } from '../src/registry/history.js';

type IncomingEntry = Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>;

interface RunResult {
  registry: Registry;
  py: Record<string, string>;
}

async function runPipeline(args: {
  outDir: string;
  registryPath: string;
  previous: Registry | null;
  history: HistoryMap;
  incoming: Record<string, IncomingEntry>;
  nextVersion: number;
  now: string;
}): Promise<RunResult> {
  const { merged } = mergeEntriesWithHistory({
    previous: args.previous,
    history: args.history,
    newEntries: args.incoming,
    nextVersion: args.nextVersion,
    now: args.now
  });
  const registry: Registry = {
    ...createEmptyRegistry(args.nextVersion, args.now),
    entries: merged
  };
  await fs.writeFile(args.registryPath, JSON.stringify(registry, null, 2), 'utf8');

  await generateLocators(registry, {
    outDir: args.outDir,
    registryPath: args.registryPath,
    lockNames: true,
    mode: 'merge'
  });

  const py: Record<string, string> = {};
  const files = await fs.readdir(args.outDir);
  for (const f of files) {
    if (!f.endsWith('.py')) continue;
    py[f] = await fs.readFile(path.join(args.outDir, f), 'utf8');
  }
  return { registry, py };
}

function variableFor(pyContent: string, testid: string): string | null {
  const match = new RegExp(`(\\w+)\\s*=\\s*"[^"]*'${testid.replace(/[-\\^$*+?.()|[\]{}]/g, '\\$&')}'`).exec(pyContent);
  return match ? match[1]! : null;
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

describe('persistence: locator names across multiple runs', () => {
  let outDir = '';
  let registryPath = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-persist-'));
    outDir = path.join(tmp, 'locators');
    registryPath = path.join(tmp, 'testids.latest.json');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('keeps every variable name when sibling order changes', async () => {
    const incoming1: Record<string, IncomingEntry> = {
      'order__button--addr': entry({ fingerprint: 'fp-A', semantic: { formcontrolname: 'addr', aria_label: null, placeholder: null, text_content: 'Save', type: null } }),
      'order__button--bill': entry({ fingerprint: 'fp-B', semantic: { formcontrolname: 'bill', aria_label: null, placeholder: null, text_content: 'Save', type: null } }),
      'order__button--ship': entry({ fingerprint: 'fp-C', semantic: { formcontrolname: 'ship', aria_label: null, placeholder: null, text_content: 'Save', type: null } })
    };

    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming: incoming1, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });

    const v1Addr = variableFor(r1.py['order.py']!, 'order__button--addr');
    const v1Bill = variableFor(r1.py['order.py']!, 'order__button--bill');
    const v1Ship = variableFor(r1.py['order.py']!, 'order__button--ship');
    expect(v1Addr).not.toBeNull();

    const incoming2: Record<string, IncomingEntry> = {
      'order__button--ship': incoming1['order__button--ship']!,
      'order__button--addr': incoming1['order__button--addr']!,
      'order__button--bill': incoming1['order__button--bill']!
    };
    const history: HistoryMap = new Map([
      ['order__button--addr', { first_seen_version: 1, latest_recorded_version: 1, generation_history: [1] }],
      ['order__button--bill', { first_seen_version: 1, latest_recorded_version: 1, generation_history: [1] }],
      ['order__button--ship', { first_seen_version: 1, latest_recorded_version: 1, generation_history: [1] }]
    ]);
    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history,
      incoming: incoming2, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });

    expect(variableFor(r2.py['order.py']!, 'order__button--addr')).toBe(v1Addr);
    expect(variableFor(r2.py['order.py']!, 'order__button--bill')).toBe(v1Bill);
    expect(variableFor(r2.py['order.py']!, 'order__button--ship')).toBe(v1Ship);
  });

  it('restores first_seen_version and locator_name when a removed element comes back', async () => {
    const incoming1: Record<string, IncomingEntry> = {
      'order__button--addr': entry({ fingerprint: 'fp-A', semantic: { formcontrolname: 'addr', aria_label: null, placeholder: null, text_content: 'Save', type: null } }),
      'order__button--bill': entry({ fingerprint: 'fp-B', semantic: { formcontrolname: 'bill', aria_label: null, placeholder: null, text_content: 'Save', type: null } })
    };
    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming: incoming1, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });
    const billVar1 = variableFor(r1.py['order.py']!, 'order__button--bill');

    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming: { 'order__button--addr': incoming1['order__button--addr']! },
      nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });
    expect(r2.py['order.py']!).not.toContain("'order__button--bill'");

    const history: HistoryMap = new Map([
      ['order__button--bill', { first_seen_version: 1, latest_recorded_version: 1, generation_history: [1] }],
      ['order__button--addr', { first_seen_version: 1, latest_recorded_version: 2, generation_history: [1] }]
    ]);
    const r3 = await runPipeline({
      outDir, registryPath, previous: r2.registry, history,
      incoming: incoming1, nextVersion: 3, now: '2026-05-03T00:00:00Z'
    });

    expect(r3.registry.entries['order__button--bill']!.first_seen_version).toBe(1);
    expect(r3.registry.entries['order__button--bill']!.last_seen_version).toBe(3);
    expect(variableFor(r3.py['order.py']!, 'order__button--bill')).toBe(billVar1);
  });

  it('frozen first member keeps its bare name; new colliding sibling takes a discriminator suffix', async () => {
    const incoming1: Record<string, IncomingEntry> = {
      'order__button--save-aaaa': entry({
        fingerprint: 'button|text=Save|event.click=saveAddress',
        semantic: {
          formcontrolname: null,
          aria_label: null,
          placeholder: null,
          text_content: 'Save',
          type: null,
          event_handlers: { click: 'saveAddress' }
        }
      })
    };
    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming: incoming1, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });
    const v1 = variableFor(r1.py['order.py']!, 'order__button--save-aaaa');
    expect(v1).toBe('order_nativeButton_save');

    const incoming2: Record<string, IncomingEntry> = {
      ...incoming1,
      'order__button--save-bbbb': entry({
        fingerprint: 'button|text=Save|event.click=saveBilling',
        semantic: {
          formcontrolname: null,
          aria_label: null,
          placeholder: null,
          text_content: 'Save',
          type: null,
          event_handlers: { click: 'saveBilling' }
        }
      })
    };
    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming: incoming2, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });

    expect(variableFor(r2.py['order.py']!, 'order__button--save-aaaa')).toBe(v1);
    expect(variableFor(r2.py['order.py']!, 'order__button--save-bbbb')).toBe(
      'order_nativeButton_save_saveBilling'
    );
  });

  it('preserves locator_name across child_shape edits via rename detection', async () => {
    const sharedSemantic = {
      formcontrolname: null,
      aria_label: 'Lieferadresse',
      placeholder: null,
      text_content: null,
      type: null
    };

    const incoming1: Record<string, IncomingEntry> = {
      'order__div--lieferadresse-aaaa': {
        component: 'src/order.component.html',
        tag: 'div',
        element_type: 'dom_div',
        fingerprint: 'div|aria-label=Lieferadresse|child_shape=h3:adresse-p:strasse',
        semantic: { ...sharedSemantic, child_shape: ['h3:adresse', 'p:strasse'] },
        source: 'generated'
      }
    };
    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming: incoming1, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });
    const v1 = variableFor(r1.py['order.py']!, 'order__div--lieferadresse-aaaa');
    expect(v1).not.toBeNull();

    const incoming2: Record<string, IncomingEntry> = {
      'order__div--lieferadresse-bbbb': {
        component: 'src/order.component.html',
        tag: 'div',
        element_type: 'dom_div',
        fingerprint: 'div|aria-label=Lieferadresse|child_shape=h3:adresse-p:strasse-img:logo',
        semantic: { ...sharedSemantic, child_shape: ['h3:adresse', 'p:strasse', 'img:logo'] },
        source: 'generated'
      }
    };
    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming: incoming2, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });

    expect(variableFor(r2.py['order.py']!, 'order__div--lieferadresse-bbbb')).toBe(v1);
  });

  it('compact child_shape suffix survives a re-run when the diverging position is unchanged', async () => {
    const incoming: Record<string, IncomingEntry> = {
      'order__div--card-aaaa': {
        component: 'src/order.component.html',
        tag: 'div',
        element_type: 'dom_div',
        fingerprint: 'div|text=Card|child_shape=h3:title-p:subtitle-img:logo',
        semantic: {
          formcontrolname: null, aria_label: null, placeholder: null,
          text_content: 'Card', type: null,
          child_shape: ['h3:title', 'p:subtitle', 'img:logo']
        },
        source: 'generated'
      },
      'order__div--card-bbbb': {
        component: 'src/order.component.html',
        tag: 'div',
        element_type: 'dom_div',
        fingerprint: 'div|text=Card|child_shape=h3:title-p:subtitle-span:badge',
        semantic: {
          formcontrolname: null, aria_label: null, placeholder: null,
          text_content: 'Card', type: null,
          child_shape: ['h3:title', 'p:subtitle', 'span:badge']
        },
        source: 'generated'
      }
    };

    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });

    const v1A = variableFor(r1.py['order.py']!, 'order__div--card-aaaa');
    const v1B = variableFor(r1.py['order.py']!, 'order__div--card-bbbb');
    expect(v1A).toBe('order_domDiv_card_imgLogo');
    expect(v1B).toBe('order_domDiv_card_spanBadge');

    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });
    expect(variableFor(r2.py['order.py']!, 'order__div--card-aaaa')).toBe(v1A);
    expect(variableFor(r2.py['order.py']!, 'order__div--card-bbbb')).toBe(v1B);
  });

  it('survivors keep their discriminator suffixes after a peer is deleted', async () => {
    const baseSem = {
      formcontrolname: null, aria_label: null, placeholder: null,
      text_content: 'Save', type: null
    };
    const incoming1: Record<string, IncomingEntry> = {
      'order__button--save-1': entry({
        fingerprint: 'button|text=Save|event.click=saveAddress',
        semantic: { ...baseSem, event_handlers: { click: 'saveAddress' } }
      }),
      'order__button--save-2': entry({
        fingerprint: 'button|text=Save|event.click=saveBilling',
        semantic: { ...baseSem, event_handlers: { click: 'saveBilling' } }
      }),
      'order__button--save-3': entry({
        fingerprint: 'button|text=Save|event.click=saveShipping',
        semantic: { ...baseSem, event_handlers: { click: 'saveShipping' } }
      })
    };
    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming: incoming1, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });
    const vAddr = variableFor(r1.py['order.py']!, 'order__button--save-1');
    const vBill = variableFor(r1.py['order.py']!, 'order__button--save-2');
    const vShip = variableFor(r1.py['order.py']!, 'order__button--save-3');
    expect(vAddr).toBe('order_nativeButton_save_saveAddress');
    expect(vBill).toBe('order_nativeButton_save_saveBilling');
    expect(vShip).toBe('order_nativeButton_save_saveShipping');

    const incoming2: Record<string, IncomingEntry> = {
      'order__button--save-1': incoming1['order__button--save-1']!,
      'order__button--save-2': incoming1['order__button--save-2']!
    };
    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming: incoming2, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });

    expect(variableFor(r2.py['order.py']!, 'order__button--save-1')).toBe(vAddr);
    expect(variableFor(r2.py['order.py']!, 'order__button--save-2')).toBe(vBill);
    expect(r2.py['order.py']!).not.toContain("'order__button--save-3'");
  });

  it('moves the locator entry into the new component file when the source path changes', async () => {
    const semantic = {
      formcontrolname: 'email', aria_label: null, placeholder: null,
      text_content: null, type: null
    };
    const incoming1: Record<string, IncomingEntry> = {
      'order__input--email': {
        component: 'src/order.component.html',
        tag: 'input',
        element_type: 'native_input',
        fingerprint: 'input|formcontrolname=email',
        semantic, source: 'generated'
      }
    };
    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming: incoming1, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });
    expect(r1.py['order.py']).toBeDefined();

    const incoming2: Record<string, IncomingEntry> = {
      'customer__input--email': {
        ...incoming1['order__input--email']!,
        component: 'src/customer.component.html'
      }
    };
    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming: incoming2, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });

    // Rename detection transfers the old name onto the cross-component move.
    expect(r2.py['customer.py']).toBeDefined();
    const newVar = variableFor(r2.py['customer.py']!, 'customer__input--email');
    expect(newVar).toBe('order_nativeInput_email');

    expect(r2.registry.entries['order__input--email']).toBeUndefined();
    expect(r2.registry.entries['customer__input--email']).toBeDefined();

    // Non-destructive: prior order.py stays. Orphans surface via --migration-report.
    expect(r2.py['order.py']).toBeDefined();

    await generateLocators(r2.registry, {
      outDir, registryPath,
      lockNames: true, regenerateNames: true, mode: 'overwrite'
    });
    const r3Customer = await fs.readFile(path.join(outDir, 'customer.py'), 'utf8');
    expect(variableFor(r3Customer, 'customer__input--email')).toBe(
      'customer_nativeInput_email'
    );
  });

  it('is idempotent: a second pipeline run with the same input changes nothing observable', async () => {
    const incoming: Record<string, IncomingEntry> = {
      'order__button--save-x': entry({
        fingerprint: 'button|text=Save|event.click=saveAddress',
        semantic: {
          formcontrolname: null, aria_label: null, placeholder: null,
          text_content: 'Save', type: null,
          event_handlers: { click: 'saveAddress' }
        }
      })
    };
    const r1 = await runPipeline({
      outDir, registryPath, previous: null, history: new Map(),
      incoming, nextVersion: 1, now: '2026-05-01T00:00:00Z'
    });
    const py1 = r1.py['order.py']!;
    const lockedName1 = r1.registry.entries['order__button--save-x']!.locator_name;

    const r2 = await runPipeline({
      outDir, registryPath, previous: r1.registry, history: new Map(),
      incoming, nextVersion: 2, now: '2026-05-02T00:00:00Z'
    });
    expect(r2.py['order.py']).toBe(py1);
    expect(r2.registry.entries['order__button--save-x']!.locator_name).toBe(lockedName1);
    expect(r2.registry.entries['order__button--save-x']!.first_seen_version).toBe(1);
    expect(r2.registry.entries['order__button--save-x']!.last_seen_version).toBe(2);
  });
});
