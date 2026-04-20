import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/index.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/index.js';

/**
 * End-to-end test for the `alwaysHash` config: every generated testid must
 * carry a hash suffix even when a semantic primary value is available.
 */
describe('tagger.alwaysHash', () => {
  let cwd = '';
  let registryDir = '';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-always-hash-'));
    registryDir = path.join(cwd, 'test-artifacts', 'testids');
    const compDir = path.join(cwd, 'src', 'app', 'login');
    await fs.mkdir(compDir, { recursive: true });
    await fs.writeFile(
      path.join(compDir, 'login.component.html'),
      `<form>
  <input formControlName="email" type="email">
  <input formControlName="password" type="password">
  <button type="submit">Sign in</button>
</form>
`,
      'utf8'
    );
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('every testid ends with a hash when alwaysHash + hash-only idFormat', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: 'tid-{hash}',
      hashLength: 8,
      alwaysHash: true,
      collisionStrategy: 'error'
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    expect(reg).not.toBeNull();
    const ids = Object.keys(reg!.entries);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id).toMatch(/^tid-[0-9a-f]{8}$/);
    }
  });

  it('does not emit a hash when alwaysHash is false and the element has a primary value', async () => {
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: '{component}__{element}--{key}{hash:-}',
      alwaysHash: false
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    expect(reg).not.toBeNull();
    // The email input has a formControlName, so no hash needed.
    const hasEmailNoHash = Object.keys(reg!.entries).some(
      (id) => id === 'login__input--email'
    );
    expect(hasEmailNoHash).toBe(true);
  });
});
