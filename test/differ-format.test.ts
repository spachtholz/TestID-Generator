import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { main as differMain } from '../src/differ/cli.js';
import { writeRegistry, createEmptyRegistry, type RegistryEntry } from '../src/registry/index.js';

function entry(fp: string): RegistryEntry {
  return {
    component: 'src/app/hello.component.html',
    tag: 'button',
    element_type: 'native_button',
    fingerprint: fp,
    semantic: {
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: null,
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1
  };
}

describe('differ --format', () => {
  let dir = '';
  let oldPath = '';
  let newPath = '';
  let outDir = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-diff-fmt-'));
    outDir = path.join(dir, 'out');

    const oldReg = {
      ...createEmptyRegistry(1, '2026-04-18T10:00:00Z'),
      entries: { 'hello__button--a': entry('button|a') }
    };
    const newReg = {
      ...createEmptyRegistry(2, '2026-04-18T11:00:00Z'),
      entries: { 'hello__button--b': entry('button|b') }
    };
    const dir1 = path.join(dir, 'old');
    const dir2 = path.join(dir, 'new');
    await writeRegistry(oldReg, { dir: dir1, version: 1 });
    await writeRegistry(newReg, { dir: dir2, version: 2 });
    oldPath = path.join(dir1, 'testids.v1.json');
    newPath = path.join(dir2, 'testids.v2.json');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('writes both md and json when --out-dir is set and no --format is given', async () => {
    await differMain(['node', 'testid-differ', oldPath, newPath, '--out-dir', outDir, '--quiet']);
    const files = await fs.readdir(outDir);
    expect(files).toContain('diff.v1-v2.md');
    expect(files).toContain('diff.v1-v2.json');
  });

  it('writes only json when --format json is passed', async () => {
    await differMain([
      'node', 'testid-differ', oldPath, newPath,
      '--out-dir', outDir, '--format', 'json', '--quiet'
    ]);
    const files = await fs.readdir(outDir);
    expect(files).toContain('diff.v1-v2.json');
    expect(files).not.toContain('diff.v1-v2.md');
  });

  it('writes only md when --format md is passed', async () => {
    await differMain([
      'node', 'testid-differ', oldPath, newPath,
      '--out-dir', outDir, '--format', 'md', '--quiet'
    ]);
    const files = await fs.readdir(outDir);
    expect(files).toContain('diff.v1-v2.md');
    expect(files).not.toContain('diff.v1-v2.json');
  });

  it('accepts comma-separated --format md,json', async () => {
    await differMain([
      'node', 'testid-differ', oldPath, newPath,
      '--out-dir', outDir, '--format', 'md,json', '--quiet'
    ]);
    const files = await fs.readdir(outDir);
    expect(files).toContain('diff.v1-v2.md');
    expect(files).toContain('diff.v1-v2.json');
  });

  it('rejects unknown --format values', async () => {
    const code = await differMain([
      'node', 'testid-differ', oldPath, newPath,
      '--out-dir', outDir, '--format', 'xlsx'
    ]);
    expect(code).toBe(2);
  });

  it('--json-only still works as a deprecated alias for --format json', async () => {
    await differMain([
      'node', 'testid-differ', oldPath, newPath,
      '--out-dir', outDir, '--json-only', '--quiet'
    ]);
    const files = await fs.readdir(outDir);
    expect(files).toContain('diff.v1-v2.json');
    expect(files).not.toContain('diff.v1-v2.md');
  });

  it('reads defaults from a testid.config.json when no CLI --format is given', async () => {
    // Put config in the directory we CD-into by setting --config explicitly.
    const cfgPath = path.join(dir, 'testid.config.json');
    await fs.writeFile(
      cfgPath,
      JSON.stringify({ differ: { outputFormats: ['json'] } })
    );
    await differMain([
      'node', 'testid-differ', oldPath, newPath,
      '--out-dir', outDir, '--config', cfgPath, '--quiet'
    ]);
    const files = await fs.readdir(outDir);
    expect(files).toContain('diff.v1-v2.json');
    expect(files).not.toContain('diff.v1-v2.md');
  });
});
