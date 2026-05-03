// Sibling-index collision strategy: assigns readable `--N` suffixes to
// elements that share a semantic fingerprint, sorted deterministically by
// source position so re-runs without source edits produce stable ids.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/index.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/index.js';

describe('collisionStrategy: sibling-index', () => {
  let cwd = '';
  let registryDir = '';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-sibling-'));
    registryDir = path.join(cwd, 'test-artifacts', 'testids');
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  async function writeTemplate(content: string): Promise<void> {
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.mkdir(compDir, { recursive: true });
    await fs.writeFile(path.join(compDir, 'order.component.html'), content, 'utf8');
  }

  it('assigns --1/--2/--3 to identical buttons in source order', async () => {
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
  <button>Same</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      collisionStrategy: 'sibling-index'
    });
    const result = await runTagger(config, { cwd });
    expect(result.collisionWarnings).toEqual([]);
    const reg = await loadLatestRegistry(registryDir);
    const ids = Object.keys(reg!.entries)
      .filter((id) => id.startsWith('order__button--'))
      .sort();
    expect(ids).toEqual([
      'order__button--same--1',
      'order__button--same--2',
      'order__button--same--3'
    ]);
  });

  it('persists the disambiguator on the registry entry', async () => {
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      collisionStrategy: 'sibling-index'
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    const e1 = reg!.entries['order__button--same--1']!;
    const e2 = reg!.entries['order__button--same--2']!;
    expect(e1.disambiguator).toEqual({ kind: 'sibling-index', value: '1' });
    expect(e2.disambiguator).toEqual({ kind: 'sibling-index', value: '2' });
  });

  it('is stable across re-runs when the source is unchanged', async () => {
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
  <button>Same</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      collisionStrategy: 'sibling-index'
    });
    await runTagger(config, { cwd });
    const reg1 = await loadLatestRegistry(registryDir);
    const ids1 = Object.keys(reg1!.entries).filter((id) => id.includes('--same--')).sort();

    // Re-run on the (now-tagged) template
    await runTagger(config, { cwd });
    const reg2 = await loadLatestRegistry(registryDir);
    const ids2 = Object.keys(reg2!.entries).filter((id) => id.includes('--same--')).sort();

    expect(ids2).toEqual(ids1);
  });

  it('uses the {disambiguator:--} slot in idFormat when present', async () => {
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: 'tid-{component}-{element}-{key}{disambiguator:--}',
      collisionStrategy: 'sibling-index'
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    const ids = Object.keys(reg!.entries)
      .filter((id) => id.startsWith('tid-order-button-'))
      .sort();
    expect(ids).toEqual([
      'tid-order-button-same--1',
      'tid-order-button-same--2'
    ]);
  });

  it('appends --N when idFormat lacks a disambiguator slot', async () => {
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      idFormat: '{component}__{element}',
      collisionStrategy: 'sibling-index'
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    const ids = Object.keys(reg!.entries)
      .filter((id) => id.startsWith('order__button'))
      .sort();
    expect(ids).toEqual(['order__button--1', 'order__button--2']);
  });
});

describe('collisionStrategy: auto', () => {
  let cwd = '';
  let registryDir = '';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-auto-'));
    registryDir = path.join(cwd, 'test-artifacts', 'testids');
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  it('is the default strategy', () => {
    const config = TaggerConfigSchema.parse({});
    expect(config.collisionStrategy).toBe('auto');
  });

  it('prefers sibling-index over hash-suffix when both could resolve', async () => {
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.mkdir(compDir, { recursive: true });
    await fs.writeFile(
      path.join(compDir, 'order.component.html'),
      `<div>
  <button>Same</button>
  <button>Same</button>
</div>`,
      'utf8'
    );
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false
    });
    await runTagger(config, { cwd });
    const reg = await loadLatestRegistry(registryDir);
    const ids = Object.keys(reg!.entries)
      .filter((id) => id.startsWith('order__button--'))
      .sort();
    // Sibling-index variants beat the hash-tagged form.
    expect(ids).toEqual([
      'order__button--same--1',
      'order__button--same--2'
    ]);
  });
});
