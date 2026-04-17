import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadFullHistory } from '../src/registry/history.js';
import { createEmptyRegistry, type Registry } from '../src/registry/schema.js';
import { writeRegistry } from '../src/registry/writer.js';

let workDir = '';

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-history-'));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

function withEntry(base: Registry, id: string): Registry {
  return {
    ...base,
    entries: {
      ...base.entries,
      [id]: {
        component: 'c.html',
        tag: 'input',
        element_type: 'native_input',
        fingerprint: 'f',
        semantic: {
          formcontrolname: null,
          aria_label: null,
          placeholder: null,
          text_content: null,
          type: null
        },
        first_seen_version: base.version,
        last_seen_version: base.version
      }
    }
  };
}

describe('loadFullHistory', () => {
  it('returns an empty map when the directory does not exist', async () => {
    const missing = path.join(workDir, 'missing');
    const h = await loadFullHistory(missing);
    expect(h.size).toBe(0);
  });

  it('reports a single-entry generation_history for continuously-present ids', async () => {
    const v1 = withEntry(createEmptyRegistry(1, '2026-01-01T00:00:00Z'), 'foo');
    const v2 = withEntry(createEmptyRegistry(2, '2026-01-02T00:00:00Z'), 'foo');
    await writeRegistry(v1, { dir: workDir, version: 1 });
    await writeRegistry(v2, { dir: workDir, version: 2 });
    const h = await loadFullHistory(workDir);
    expect(h.get('foo')?.generation_history).toEqual([1]);
  });

  it('detects regeneration when the id disappears and comes back', async () => {
    const v1 = withEntry(createEmptyRegistry(1, '2026-01-01T00:00:00Z'), 'foo');
    const v2 = createEmptyRegistry(2, '2026-01-02T00:00:00Z'); // foo absent
    const v3 = withEntry(createEmptyRegistry(3, '2026-01-03T00:00:00Z'), 'foo');
    await writeRegistry(v1, { dir: workDir, version: 1 });
    await writeRegistry(v2, { dir: workDir, version: 2 });
    await writeRegistry(v3, { dir: workDir, version: 3 });
    const h = await loadFullHistory(workDir);
    const record = h.get('foo');
    expect(record?.first_seen_version).toBe(1);
    expect(record?.latest_recorded_version).toBe(3);
    expect(record?.generation_history).toEqual([1, 3]);
  });
});
