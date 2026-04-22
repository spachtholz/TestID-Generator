import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writeRegistry,
  isoToFileSafe,
  isVersionedRegistryFile
} from '../src/registry/writer.js';
import { createEmptyRegistry } from '../src/registry/schema.js';
import { loadFullHistory } from '../src/registry/history.js';

let workDir = '';

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-naming-'));
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('isoToFileSafe', () => {
  it('replaces colons and dots in an ISO timestamp', () => {
    expect(isoToFileSafe('2026-04-22T13:00:00.000Z')).toBe('2026-04-22T13-00-00-000Z');
  });
});

describe('isVersionedRegistryFile', () => {
  it('accepts classic version files', () => {
    expect(isVersionedRegistryFile('testids.v1.json')).toBe(true);
    expect(isVersionedRegistryFile('testids.v42.json')).toBe(true);
  });

  it('accepts timestamp files', () => {
    expect(isVersionedRegistryFile('testids.2026-04-22T13-00-00-000Z.json')).toBe(true);
  });

  it('rejects unrelated files', () => {
    expect(isVersionedRegistryFile('testids.latest.json')).toBe(false);
    expect(isVersionedRegistryFile('other.json')).toBe(false);
  });
});

describe('writeRegistry with naming="version"', () => {
  it('writes the classic testids.v{N}.json name', async () => {
    const reg = createEmptyRegistry(1, '2026-04-22T13:00:00.000Z');
    const result = await writeRegistry(reg, { dir: workDir, version: 1, naming: 'version' });
    expect(path.basename(result.versionedPath)).toBe('testids.v1.json');
    const files = await fs.readdir(workDir);
    expect(files).toContain('testids.v1.json');
    expect(files).toContain('testids.latest.json');
  });
});

describe('writeRegistry with naming="timestamp"', () => {
  it('writes the file name derived from generated_at', async () => {
    const reg = createEmptyRegistry(1, '2026-04-22T13:00:00.000Z');
    const result = await writeRegistry(reg, {
      dir: workDir,
      version: 1,
      naming: 'timestamp'
    });
    expect(path.basename(result.versionedPath)).toBe('testids.2026-04-22T13-00-00-000Z.json');
    const files = await fs.readdir(workDir);
    expect(files).toContain('testids.2026-04-22T13-00-00-000Z.json');
    expect(files).toContain('testids.latest.json');
  });

  it('latest still mirrors the snapshot content', async () => {
    const reg = createEmptyRegistry(7, '2026-04-22T14:30:00.500Z');
    await writeRegistry(reg, { dir: workDir, version: 7, naming: 'timestamp' });
    const latest = await fs.readFile(path.join(workDir, 'testids.latest.json'), 'utf8');
    const stamped = await fs.readFile(
      path.join(workDir, 'testids.2026-04-22T14-30-00-500Z.json'),
      'utf8'
    );
    expect(latest).toBe(stamped);
  });

  it('history picks up timestamped files', async () => {
    const a = createEmptyRegistry(1, '2026-04-22T10:00:00.000Z');
    a.entries['x'] = {
      component: 'x.html',
      tag: 'button',
      element_type: 'native_button',
      fingerprint: 'button|x',
      semantic: {
        formcontrolname: null,
        name: null,
        routerlink: null,
        aria_label: null,
        placeholder: null,
        text_content: 'x',
        type: null,
        role: null
      },
      source: 'generated',
      first_seen_version: 1,
      last_seen_version: 1,
      generation_history: [1]
    };
    await writeRegistry(a, { dir: workDir, version: 1, naming: 'timestamp' });

    const b = createEmptyRegistry(2, '2026-04-22T11:00:00.000Z');
    b.entries['y'] = { ...a.entries['x']!, first_seen_version: 2, last_seen_version: 2, generation_history: [2] };
    await writeRegistry(b, { dir: workDir, version: 2, naming: 'timestamp' });

    const history = await loadFullHistory(workDir);
    expect(history.size).toBe(2);
    expect(history.get('x')?.first_seen_version).toBe(1);
    expect(history.get('y')?.first_seen_version).toBe(2);
  });

  it('retention prunes oldest snapshots regardless of naming', async () => {
    for (let v = 1; v <= 5; v++) {
      const reg = createEmptyRegistry(v, `2026-04-22T10:0${v}:00.000Z`);
      await writeRegistry(reg, { dir: workDir, version: v, naming: 'timestamp', retention: 3 });
    }
    const files = (await fs.readdir(workDir)).filter((f) => f !== 'testids.latest.json');
    expect(files).toHaveLength(3);
  });
});
