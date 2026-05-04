// Registry-aware sibling-index resolution: when a previous registry is
// available, fingerprint-matching candidates inherit their old `--N` slot
// rather than being re-numbered by source position. Genuinely new members
// get the next free slot value. Group-size changes surface a warning so
// the user can verify tests against the surviving mapping.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/index.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/index.js';

describe('registry-aware sibling-index resolution', () => {
  let cwd = '';
  let registryDir = '';
  let outputDir = '';
  let templatePath = '';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-regaware-'));
    registryDir = path.join(cwd, 'test-artifacts', 'testids');
    outputDir = path.join(cwd, 'dist');
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.mkdir(compDir, { recursive: true });
    templatePath = path.join(compDir, 'order.component.html');
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  function configFor(): ReturnType<typeof TaggerConfigSchema.parse> {
    return TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false,
      collisionStrategy: 'sibling-index',
      writeBackups: false
    });
  }

  // Source-clean run: tagger writes to outputDir so the next run sees the
  // template as if no testids had ever been baked into it. Mirrors the
  // "registry mode, no testid in git" deployment story.
  async function runOnCleanSource(template: string): Promise<void> {
    await fs.writeFile(templatePath, template, 'utf8');
    await runTagger(configFor(), { cwd, outputDir });
  }

  it('preserves slot ids when a non-identical sibling is inserted in front of the group', async () => {
    // V1: two identical save buttons → save--1, save--2
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const v1 = await loadLatestRegistry(registryDir);
    const v1Saves = Object.keys(v1!.entries).filter((id) => id.includes('--save--')).sort();
    expect(v1Saves).toEqual(['order__button--save--1', 'order__button--save--2']);

    // V2: prepend a Reset button (different fingerprint, doesn't join the
    // collision group). The two Save buttons stay byte-identical. Without
    // registry awareness the resolver would re-number from source position
    // — same result here, but the carry-over from previous slots is what
    // we're verifying.
    await runOnCleanSource(
      `<div>
  <button (click)="reset()">Reset</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const v2 = await loadLatestRegistry(registryDir);
    const v2Saves = Object.keys(v2!.entries).filter((id) => id.includes('--save--')).sort();
    expect(v2Saves).toEqual(['order__button--save--1', 'order__button--save--2']);
    // Reset is its own singleton, no disambiguator.
    expect(Object.keys(v2!.entries)).toContain('order__button--reset');
  });

  it('keeps existing slot ids and assigns next-free for an identical newcomer at the END', async () => {
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );

    // V2: append a third identical Save. Source order = [old-1, old-2, NEW].
    // Registry-aware resolver matches old-1 → --1, old-2 → --2, NEW → --3.
    const result = await fs.readFile(templatePath, 'utf8');
    expect(result).not.toContain('data-testid'); // confirm template stayed clean (outputDir mode)
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const v2 = await loadLatestRegistry(registryDir);
    const ids = Object.keys(v2!.entries).filter((id) => id.includes('--save--')).sort();
    expect(ids).toEqual([
      'order__button--save--1',
      'order__button--save--2',
      'order__button--save--3'
    ]);
  });

  it('drops the orphaned slot when the last identical sibling is deleted', async () => {
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );

    // V2: drop the third Save. The two survivors stay matched to --1 and --2.
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const v2 = await loadLatestRegistry(registryDir);
    const ids = Object.keys(v2!.entries).filter((id) => id.includes('--save--')).sort();
    expect(ids).toEqual(['order__button--save--1', 'order__button--save--2']);
  });

  it('emits a group-size-changed warning when the collision group shrinks', async () => {
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    await fs.writeFile(
      templatePath,
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`,
      'utf8'
    );
    const result = await runTagger(configFor(), { cwd, outputDir });
    const sizeWarning = result.collisionWarnings.find(
      (w) => w.reason === 'collision-group-size-changed'
    );
    expect(sizeWarning).toBeDefined();
    expect(sizeWarning?.previousGroupSize).toBe(3);
    expect(sizeWarning?.currentGroupSize).toBe(2);
  });

  it('emits a group-size-changed warning when the collision group grows', async () => {
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    await fs.writeFile(
      templatePath,
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`,
      'utf8'
    );
    const result = await runTagger(configFor(), { cwd, outputDir });
    const sizeWarning = result.collisionWarnings.find(
      (w) => w.reason === 'collision-group-size-changed'
    );
    expect(sizeWarning).toBeDefined();
    expect(sizeWarning?.previousGroupSize).toBe(2);
    expect(sizeWarning?.currentGroupSize).toBe(3);
  });

  it('emits a group-size-changed warning when a former collision shrinks to a singleton', async () => {
    // V1: 3 identical buttons → group of 3.
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    // V2: only 1 left → singleton, gets the bare id without disambiguator.
    await fs.writeFile(
      templatePath,
      `<div>
  <button (click)="save()">Save</button>
</div>`,
      'utf8'
    );
    const result = await runTagger(configFor(), { cwd, outputDir });
    const sizeWarning = result.collisionWarnings.find(
      (w) => w.reason === 'collision-group-size-changed'
    );
    expect(sizeWarning).toBeDefined();
    expect(sizeWarning?.previousGroupSize).toBe(3);
    expect(sizeWarning?.currentGroupSize).toBe(1);

    const v2 = await loadLatestRegistry(registryDir);
    expect(v2!.entries).toHaveProperty('order__button--save');
  });

  it('does not warn on a stable size match (no insertion or deletion)', async () => {
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const result = await runTagger(configFor(), { cwd, outputDir });
    const sizeWarning = result.collisionWarnings.find(
      (w) => w.reason === 'collision-group-size-changed'
    );
    expect(sizeWarning).toBeUndefined();
  });

  it('falls back to source-position ordering on the first run (no previous registry)', async () => {
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const v1 = await loadLatestRegistry(registryDir);
    const ids = Object.keys(v1!.entries).filter((id) => id.includes('--save--')).sort();
    expect(ids).toEqual([
      'order__button--save--1',
      'order__button--save--2',
      'order__button--save--3'
    ]);
  });

  it('lets a fingerprint-edited candidate leave the group cleanly while peers keep their slots', async () => {
    // V1: three identical
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    // V2: middle one gets an aria-label, becoming uniquely identifiable.
    // Group shrinks to 2 (the unchanged two), the modified one becomes its
    // own singleton with a different id.
    await runOnCleanSource(
      `<div>
  <button (click)="save()">Save</button>
  <button aria-label="Save and continue" (click)="save()">Save</button>
  <button (click)="save()">Save</button>
</div>`
    );
    const v2 = await loadLatestRegistry(registryDir);
    const saveIds = Object.keys(v2!.entries).filter((id) => id.includes('--save')).sort();
    // The two unchanged peers preserve --1 and --2 by fingerprint match (was
    // in source positions 1 and 3 in V1, now in positions 1 and 3 in V2 too).
    expect(saveIds).toContain('order__button--save--1');
    expect(saveIds).toContain('order__button--save--2');
    // The aria-labelled one carries its own readable key.
    const ariaScoped = saveIds.find((id) => id.includes('and-continue'));
    expect(ariaScoped).toBeDefined();
  });
});
