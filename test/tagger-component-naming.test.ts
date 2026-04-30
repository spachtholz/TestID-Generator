// Component-path disambiguation in the tagger (Schicht 3 of the monorepo
// problem). Two templates that share a basename — common in monorepos with
// `apps/{name}/...` layouts — must not produce colliding testids in the
// registry, otherwise the second app's entry silently overwrites the first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/loader.js';

describe('runTagger - componentNaming', () => {
  let workDir = '';
  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-cnaming-'));
    await fs.mkdir(path.join(workDir, 'src/apps/admin'), { recursive: true });
    await fs.mkdir(path.join(workDir, 'src/apps/customer'), { recursive: true });
    await fs.writeFile(
      path.join(workDir, 'src/apps/admin/dialog.component.html'),
      `<button>Confirm</button>`
    );
    await fs.writeFile(
      path.join(workDir, 'src/apps/customer/dialog.component.html'),
      `<button>Confirm</button>`
    );
  });
  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('default basename: BOTH testids collide on the same key (legacy behavior)', async () => {
    const config = { ...DEFAULT_CONFIG, testConfigurationOnly: false, rootDir: 'src' };
    await runTagger(config, { cwd: workDir });
    const reg = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    const ids = Object.keys(reg!.entries);
    // legacy: both write `dialog__button--confirm` and one overwrites the
    // other in the registry map. We see exactly ONE entry for the colliding
    // testid — that's the bug we want users to opt out of.
    expect(ids).toContain('dialog__button--confirm');
    const collidingEntries = ids.filter((id) => id === 'dialog__button--confirm');
    expect(collidingEntries.length).toBe(1);
  });

  it('disambiguate: prefixes basename with uncommon path segment', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      testConfigurationOnly: false,
      rootDir: 'src',
      componentNaming: 'disambiguate' as const
    };
    await runTagger(config, { cwd: workDir });
    const reg = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    const ids = Object.keys(reg!.entries).sort();
    expect(ids).toContain('admin-dialog__button--confirm');
    expect(ids).toContain('customer-dialog__button--confirm');
    // and no longer the colliding bare form
    expect(ids).not.toContain('dialog__button--confirm');
  });

  it('basename-strict: throws when basenames collide', async () => {
    const config = {
      ...DEFAULT_CONFIG,
      testConfigurationOnly: false,
      rootDir: 'src',
      componentNaming: 'basename-strict' as const
    };
    await expect(runTagger(config, { cwd: workDir })).rejects.toThrow(
      /component-name collision/
    );
  });

  it('does not disambiguate non-colliding basenames', async () => {
    // Add a third file with a unique basename.
    await fs.writeFile(
      path.join(workDir, 'src/apps/admin/sidebar.component.html'),
      `<a routerlink="/home">Home</a>`
    );
    const config = {
      ...DEFAULT_CONFIG,
      testConfigurationOnly: false,
      rootDir: 'src',
      componentNaming: 'disambiguate' as const
    };
    await runTagger(config, { cwd: workDir });
    const reg = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    const ids = Object.keys(reg!.entries);
    // sidebar is unique → keeps the bare `sidebar__…` slug
    expect(ids.some((id) => id.startsWith('sidebar__'))).toBe(true);
    expect(ids.some((id) => id.startsWith('admin-sidebar__'))).toBe(false);
  });
});
