import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadTestidConfig } from '../src/config/loader.js';

describe('loadTestidConfig', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-cfg-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', async () => {
    const r = await loadTestidConfig(undefined, dir);
    expect(r.configPath).toBeNull();
    expect(r.isLegacy).toBe(false);
    expect(r.config.tagger.rootDir).toBe('src');
    expect(r.config.differ.outputFormats).toEqual(['md', 'json']);
    expect(r.config.locators.variableFormat).toBe('{component}_{element}_{key}');
  });

  it('parses a unified testid.config.json with all three sections', async () => {
    const cfg = {
      tagger: { rootDir: 'custom-src', attributeName: 'data-cy' },
      differ: { outputFormats: ['json'], threshold: 0.9 },
      locators: { variableFormat: '{element}_{key}', xpathPrefix: '' }
    };
    await fs.writeFile(path.join(dir, 'testid.config.json'), JSON.stringify(cfg));
    const r = await loadTestidConfig(undefined, dir);
    expect(r.isLegacy).toBe(false);
    expect(r.config.tagger.rootDir).toBe('custom-src');
    expect(r.config.tagger.attributeName).toBe('data-cy');
    expect(r.config.differ.outputFormats).toEqual(['json']);
    expect(r.config.differ.threshold).toBe(0.9);
    expect(r.config.locators.variableFormat).toBe('{element}_{key}');
    expect(r.config.locators.xpathPrefix).toBe('');
  });

  it('wraps a legacy testid-tagger.config.json into the tagger section', async () => {
    const legacy = { rootDir: 'legacy-src', hashLength: 8 };
    await fs.writeFile(path.join(dir, 'testid-tagger.config.json'), JSON.stringify(legacy));
    const r = await loadTestidConfig(undefined, dir);
    expect(r.isLegacy).toBe(true);
    expect(r.config.tagger.rootDir).toBe('legacy-src');
    expect(r.config.tagger.hashLength).toBe(8);
    // Differ & locators still get their defaults.
    expect(r.config.differ.outputFormats).toEqual(['md', 'json']);
    expect(r.config.locators.variableFormat).toBe('{component}_{element}_{key}');
  });

  it('prefers testid.config.json over the legacy file when both exist', async () => {
    await fs.writeFile(
      path.join(dir, 'testid.config.json'),
      JSON.stringify({ tagger: { rootDir: 'new-src' } })
    );
    await fs.writeFile(
      path.join(dir, 'testid-tagger.config.json'),
      JSON.stringify({ rootDir: 'legacy-src' })
    );
    const r = await loadTestidConfig(undefined, dir);
    expect(r.isLegacy).toBe(false);
    expect(r.config.tagger.rootDir).toBe('new-src');
  });

  it('wraps a bare config that has no known section keys', async () => {
    // Legacy-looking content in a non-legacy filename — still wrapped.
    await fs.writeFile(
      path.join(dir, 'testid.config.json'),
      JSON.stringify({ rootDir: 'implicit-src', hashLength: 5 })
    );
    const r = await loadTestidConfig(undefined, dir);
    expect(r.isLegacy).toBe(true);
    expect(r.config.tagger.rootDir).toBe('implicit-src');
    expect(r.config.tagger.hashLength).toBe(5);
  });
});
