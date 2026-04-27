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

  it('throws a clear error when idFormat cannot disambiguate collisions', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      // No {hash} / {hash:-} placeholder => hash-suffix strategy is impotent.
      idFormat: '{component}__{element}',
      collisionStrategy: 'hash-suffix'
    });
    await expect(runTagger(config, { cwd })).rejects.toThrow(
      /no \{hash\} or \{hash:-\} placeholder/
    );
  });
});
