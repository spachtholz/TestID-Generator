import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/index.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/index.js';

/**
 * Regression: when collisionStrategy='hash-suffix' rewrites a colliding id, the
 * second generateId call must honour the user's idFormat - not silently fall
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
      hashLength: 6,
      collisionStrategy: 'hash-suffix'
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    expect(reg).not.toBeNull();
    const buttonIds = Object.keys(reg!.entries).filter((id) =>
      id.startsWith('tid--order--button')
    );
    expect(buttonIds.length).toBe(3);
    // Hash-suffix strategy treats the whole colliding group uniformly: every
    // member gets the hash suffix, including the first one. This is more
    // honest than the legacy "first wins bare, rest get hash" - re-running
    // after deleting the first button no longer renames the other twos' ids.
    for (const id of buttonIds) {
      expect(id).toMatch(/^tid--order--button-[0-9a-f]{6}$/);
    }
  });

  it('auto strategy resolves with sibling-index suffixes when no hash slot is available', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      // No {hash} / {hash:-} / {disambiguator} placeholder - the auto
      // strategy's append-`--N` fallback should still produce unique ids.
      idFormat: '{component}__{element}',
      collisionStrategy: 'auto'
    });
    const result = await runTagger(config, { cwd });
    expect(result.collisionWarnings.length).toBe(0);
    const reg = await loadLatestRegistry(registryDir);
    const buttonIds = Object.keys(reg!.entries)
      .filter((id) => id.startsWith('order__button'))
      .sort();
    expect(buttonIds).toEqual([
      'order__button--1',
      'order__button--2',
      'order__button--3'
    ]);
  });

  it('warns (not throws) and shares the id when hash-suffix has no slot', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      // hash-suffix strategy + no {hash} slot => unresolvable, all members
      // share the bare id and each gets a warning.
      idFormat: '{component}__{element}',
      collisionStrategy: 'hash-suffix'
    });
    const result = await runTagger(config, { cwd });
    expect(result.collisionWarnings.length).toBe(3); // all three buttons in the group
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

  it('warns (not throws) when elements share an identical fingerprint under hash-suffix', async () => {
    // Three identical buttons => byte-identical fingerprints => identical
    // hashes. hash-suffix can't differentiate them at all. The whole group
    // shares the bare id and each member gets a warning.
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
    expect(result.collisionWarnings.length).toBe(3);
    for (const w of result.collisionWarnings) {
      expect(w.reason).toBe('identical-fingerprint');
    }
  });

  it('auto strategy resolves identical-fingerprint groups via sibling-index', async () => {
    // Same three identical buttons, but auto picks sibling-index first which
    // doesn't depend on the fingerprint differing - assigns --1/--2/--3.
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
      collisionStrategy: 'auto'
    });
    const result = await runTagger(config, { cwd });
    expect(result.collisionWarnings).toEqual([]);
    const reg = await loadLatestRegistry(registryDir);
    const buttonIds = Object.keys(reg!.entries).filter((id) => id.startsWith('order__button--')).sort();
    expect(buttonIds).toEqual([
      'order__button--same--1',
      'order__button--same--2',
      'order__button--same--3'
    ]);
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
