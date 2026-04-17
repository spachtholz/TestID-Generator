import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { parseRegistry, loadLatestRegistry, RegistryValidationError } from '../src/registry/loader.js';
import { writeRegistry } from '../src/registry/writer.js';
import { createEmptyRegistry } from '../src/registry/schema.js';

let workDir = '';

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-loader-'));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('parseRegistry', () => {
  it('accepts a well-formed registry', () => {
    const reg = createEmptyRegistry(1, '2026-04-16T10:30:00Z');
    const str = JSON.stringify(reg);
    const parsed = parseRegistry(str);
    expect(parsed.version).toBe(1);
    expect(parsed.entries).toEqual({});
  });

  it('rejects a registry missing required fields', () => {
    const bad = JSON.stringify({ version: 1 });
    expect(() => parseRegistry(bad)).toThrow(RegistryValidationError);
  });
});

describe('loadLatestRegistry', () => {
  it('returns null when no registry has been written yet', async () => {
    expect(await loadLatestRegistry(workDir)).toBeNull();
  });

  it('round-trips through writeRegistry + loadLatestRegistry', async () => {
    const reg = createEmptyRegistry(1, '2026-04-16T10:30:00Z');
    await writeRegistry(reg, { dir: workDir });
    const loaded = await loadLatestRegistry(workDir);
    expect(loaded?.version).toBe(1);
    expect(loaded?.generated_at).toBe('2026-04-16T10:30:00Z');
  });
});

describe('parseRegistry — legacy compat', () => {
  it('backfills missing entry.source as "generated"', () => {
    const legacyJson = {
      $schema: './testid-registry.schema.json',
      version: 1,
      generated_at: '2026-01-01T00:00:00Z',
      build_id: null,
      app_version: null,
      framework_versions: {},
      entries: {
        'legacy-id': {
          component: 'x.html',
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
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };
    const parsed = parseRegistry(JSON.stringify(legacyJson));
    expect(parsed.entries['legacy-id']?.source).toBe('generated');
  });
});
