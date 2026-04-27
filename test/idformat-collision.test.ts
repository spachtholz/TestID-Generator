import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/index.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/index.js';

/**
 * Regression: when collisionStrategy='hash-suffix' rewrites a colliding id, the
 * second generateId call must honour the user's idFormat — not silently fall
 * back to DEFAULT_ID_FORMAT.
 */
describe('tagger.idFormat under collisions', () => {
  let cwd = '';
  let registryDir = '';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-idformat-collision-'));
    registryDir = path.join(cwd, 'test-artifacts', 'testids');
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.mkdir(compDir, { recursive: true });
    // Three buttons whose fingerprints differ but whose user-format-rendered
    // ids collide (idFormat below renders only {component}+{element}).
    await fs.writeFile(
      path.join(compDir, 'order.component.html'),
      `<div>
  <button>Foo</button>
  <button>Bar</button>
  <button>Baz</button>
</div>
`,
      'utf8'
    );
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('preserves a custom idFormat when disambiguating collisions', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: 'tid--{component}--{element}{hash:-}',
      hashLength: 6
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    expect(reg).not.toBeNull();
    const buttonIds = Object.keys(reg!.entries).filter((id) =>
      id.startsWith('tid--order--button')
    );
    expect(buttonIds.length).toBe(3);
    // First button has no collision yet, so renders without the hash suffix.
    expect(buttonIds).toContain('tid--order--button');
    // The two collision-resolved ids must keep the user's prefix and shape.
    const disambiguated = buttonIds.filter((id) => id !== 'tid--order--button');
    expect(disambiguated.length).toBe(2);
    for (const id of disambiguated) {
      expect(id).toMatch(/^tid--order--button-[0-9a-f]{6}$/);
    }
  });

  it('warns (not throws) and shares the id when idFormat cannot disambiguate', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      // No {hash} / {hash:-} placeholder => hash-suffix strategy is impotent.
      idFormat: '{component}__{element}',
      collisionStrategy: 'hash-suffix'
    });
    const result = await runTagger(config, { cwd });
    expect(result.collisionWarnings.length).toBe(2); // buttons 2 and 3
    for (const w of result.collisionWarnings) {
      expect(w.reason).toBe('no-hash-placeholder');
      expect(w.id).toBe('order__button');
    }
  });

  it('does not false-positive on hash-only formats with alwaysHash', async () => {
    // alwaysHash means wouldGenerate already includes the hash slot, so the
    // disambiguation pass produces a byte-equal string. The static format
    // check must not interpret that as "format has no hash placeholder".
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: 'tid-{hash}',
      hashLength: 8,
      alwaysHash: true
    });
    const result = await runTagger(config, { cwd });
    expect(result.collisionWarnings).toEqual([]);
    const reg = await loadLatestRegistry(registryDir);
    expect(reg).not.toBeNull();
    const ids = Object.keys(reg!.entries);
    for (const id of ids) {
      expect(id).toMatch(/^tid-[0-9a-f]{8}$/);
    }
  });

  it('warns (not throws) when elements share an identical fingerprint', async () => {
    // Three identical buttons => identical fingerprints. Button 1 lands as
    // 'order__button--same' (no hash, primaryValue present). Buttons 2 and 3
    // both disambiguate to the same hashed id - hash-suffix can't split them.
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.writeFile(
      path.join(compDir, 'order.component.html'),
      `<div>
  <button>Same</button>
  <button>Same</button>
  <button>Same</button>
</div>
`,
      'utf8'
    );
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: '{component}__{element}--{key}{hash:-}',
      collisionStrategy: 'hash-suffix'
    });
    const result = await runTagger(config, { cwd });
    // Button 2 collides with button 1's no-hash form, gets disambiguated to a
    // hashed id; button 3 collides with that same hashed id => 1 warning for
    // the truly unresolvable third copy.
    expect(result.collisionWarnings.length).toBe(1);
    expect(result.collisionWarnings[0]!.reason).toBe('identical-fingerprint');
  });

  it('still throws when collisionStrategy is "error"', async () => {
    // Override the per-test fixture with identical buttons so a collision is
    // guaranteed regardless of the format.
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.writeFile(
      path.join(compDir, 'order.component.html'),
      `<div>
  <button>Same</button>
  <button>Same</button>
</div>
`,
      'utf8'
    );
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: '{component}__{element}--{key}{hash:-}',
      collisionStrategy: 'error'
    });
    await expect(runTagger(config, { cwd })).rejects.toThrow(/collision on id/);
  });
});
