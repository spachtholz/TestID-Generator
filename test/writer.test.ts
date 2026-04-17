import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writeRegistry,
  serializeRegistry,
  findHighestExistingVersion,
  mergeWithPrevious,
  detectManualOverrideEvents
} from '../src/registry/writer.js';
import { createEmptyRegistry, type Registry } from '../src/registry/schema.js';

let workDir = '';

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-registry-'));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('serializeRegistry', () => {
  it('produces deterministic, alphabetically-sorted JSON', () => {
    const reg: Registry = {
      $schema: './testid-registry.schema.json',
      version: 1,
      generated_at: '2026-04-16T10:30:00Z',
      build_id: null,
      app_version: null,
      framework_versions: { primeng: '20.3.1', angular: '20.1.0' },
      entries: {
        'z-id': {
          component: 'z.component.html',
          tag: 'input',
          element_type: 'native_input',
          fingerprint: 'input|name=z',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 1
        },
        'a-id': {
          component: 'a.component.html',
          tag: 'input',
          element_type: 'native_input',
          fingerprint: 'input|name=a',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };
    const out1 = serializeRegistry(reg);
    const out2 = serializeRegistry(reg);
    expect(out1).toBe(out2);

    // 'a-id' must appear before 'z-id' (alphabetic key sort)
    expect(out1.indexOf('"a-id"')).toBeLessThan(out1.indexOf('"z-id"'));
    // angular before primeng
    expect(out1.indexOf('angular')).toBeLessThan(out1.indexOf('primeng'));
  });
});

describe('findHighestExistingVersion', () => {
  it('returns 0 when directory is missing', async () => {
    const missing = path.join(workDir, 'missing');
    expect(await findHighestExistingVersion(missing)).toBe(0);
  });

  it('finds the highest versioned file', async () => {
    await fs.writeFile(path.join(workDir, 'testids.v1.json'), '{}');
    await fs.writeFile(path.join(workDir, 'testids.v7.json'), '{}');
    await fs.writeFile(path.join(workDir, 'testids.v3.json'), '{}');
    await fs.writeFile(path.join(workDir, 'testids.latest.json'), '{}');
    await fs.writeFile(path.join(workDir, 'other.json'), '{}');
    expect(await findHighestExistingVersion(workDir)).toBe(7);
  });
});

describe('writeRegistry', () => {
  it('writes versioned + latest files and increments the version counter', async () => {
    const reg = createEmptyRegistry(1, '2026-04-16T10:30:00Z');
    const r1 = await writeRegistry(reg, { dir: workDir });
    expect(r1.version).toBe(1);
    expect(r1.versionedPath.endsWith('testids.v1.json')).toBe(true);
    expect(r1.latestPath.endsWith('testids.latest.json')).toBe(true);

    const r2 = await writeRegistry(reg, { dir: workDir });
    expect(r2.version).toBe(2);

    const latest = await fs.readFile(r2.latestPath, 'utf8');
    const v2 = await fs.readFile(r2.versionedPath, 'utf8');
    expect(latest).toBe(v2);
    expect(JSON.parse(latest).version).toBe(2);
  });
});

describe('mergeWithPrevious', () => {
  it('preserves first_seen_version and bumps last_seen_version', () => {
    const prev: Registry = {
      ...createEmptyRegistry(5, '2026-01-01T00:00:00Z'),
      entries: {
        keep: {
          component: 'c.html',
          tag: 'input',
          element_type: 'native_input',
          fingerprint: 'input|name=keep',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          },
          first_seen_version: 2,
          last_seen_version: 5
        }
      }
    };
    const merged = mergeWithPrevious(
      prev,
      {
        keep: {
          component: 'c.html',
          tag: 'input',
          element_type: 'native_input',
          fingerprint: 'input|name=keep',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null
          }
        },
        brandnew: {
          component: 'c.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'button|text=Go',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Go',
            type: null
          }
        }
      },
      6
    );
    expect(merged.keep?.first_seen_version).toBe(2);
    expect(merged.keep?.last_seen_version).toBe(6);
    expect(merged.brandnew?.first_seen_version).toBe(6);
    expect(merged.brandnew?.last_seen_version).toBe(6);
  });
});

describe('detectManualOverrideEvents', () => {
  const semantic = {
    formcontrolname: null,
    aria_label: null,
    placeholder: null,
    text_content: null,
    type: null
  };

  it('flags entries that go from generated to manual', () => {
    const prev: Registry = {
      ...createEmptyRegistry(3, '2026-01-01T00:00:00Z'),
      entries: {
        'x__button--go': {
          component: 'x.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'button|text=Go',
          semantic,
          source: 'generated',
          first_seen_version: 1,
          last_seen_version: 3
        }
      }
    };
    const merged = {
      'x__button--go': {
        component: 'x.html',
        tag: 'button',
        element_type: 'native_button',
        fingerprint: 'button|text=Go',
        semantic,
        source: 'manual' as const,
        first_seen_version: 1,
        last_seen_version: 4
      }
    };
    const flips = detectManualOverrideEvents(prev, merged);
    expect(flips).toEqual([{ id: 'x__button--go', component: 'x.html', previousVersion: 3 }]);
  });

  it('does not flag unchanged generated entries or already-manual entries', () => {
    const prev: Registry = {
      ...createEmptyRegistry(3, '2026-01-01T00:00:00Z'),
      entries: {
        stable: {
          component: 'x.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'f',
          semantic,
          source: 'generated',
          first_seen_version: 1,
          last_seen_version: 3
        },
        alreadyManual: {
          component: 'x.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'f',
          semantic,
          source: 'manual',
          first_seen_version: 1,
          last_seen_version: 3
        }
      }
    };
    const merged = {
      stable: { ...prev.entries.stable, last_seen_version: 4 },
      alreadyManual: { ...prev.entries.alreadyManual, last_seen_version: 4 }
    };
    expect(detectManualOverrideEvents(prev, merged)).toEqual([]);
  });

  it('returns empty array when there is no previous registry', () => {
    const merged = {
      fresh: {
        component: 'x.html',
        tag: 'button',
        element_type: 'native_button',
        fingerprint: 'f',
        semantic,
        source: 'manual' as const,
        first_seen_version: 1,
        last_seen_version: 1
      }
    };
    expect(detectManualOverrideEvents(null, merged)).toEqual([]);
  });

  it('treats a missing previous source as generated (legacy compat)', () => {
    const prev: Registry = {
      ...createEmptyRegistry(1, '2026-01-01T00:00:00Z'),
      entries: {
        legacy: {
          component: 'x.html',
          tag: 'button',
          element_type: 'native_button',
          fingerprint: 'f',
          semantic,
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };
    const merged = {
      legacy: {
        ...prev.entries.legacy,
        source: 'manual' as const,
        last_seen_version: 2
      }
    };
    expect(detectManualOverrideEvents(prev, merged)).toHaveLength(1);
  });
});
