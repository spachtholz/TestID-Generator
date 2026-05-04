// Stability guarantee under the new sibling-index strategy: Robot Framework
// variable names locked via `locators.lockNames` must survive across re-tags
// even when the testid string itself shifts (sibling added/removed in source).
// This is what makes the tagger safe to run repeatedly in CI.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/index.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import { generateLocators } from '../src/locators/generator.js';
import { loadLatestRegistry } from '../src/registry/index.js';

describe('sibling-index strategy + lockNames continuity', () => {
  let cwd = '';
  let registryDir = '';
  let locatorsDir = '';

  beforeEach(async () => {
    cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-lockname-'));
    registryDir = path.join(cwd, 'test-artifacts', 'testids');
    locatorsDir = path.join(cwd, 'test-artifacts', 'locators');
    const compDir = path.join(cwd, 'src', 'app', 'order');
    await fs.mkdir(compDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(cwd, { recursive: true, force: true });
  });

  async function writeTemplate(content: string): Promise<void> {
    await fs.writeFile(
      path.join(cwd, 'src', 'app', 'order', 'order.component.html'),
      content,
      'utf8'
    );
  }

  async function generate(registry: NonNullable<Awaited<ReturnType<typeof loadLatestRegistry>>>): Promise<void> {
    await generateLocators(registry, {
      outDir: locatorsDir,
      registryPath: path.join(registryDir, 'testids.latest.json'),
      lockNames: true
    });
  }

  it('preserves Robot variable name when a sibling is inserted before the locked element', async () => {
    // Initial template: 2 identical buttons → sibling-index --1 / --2.
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false
    });

    await runTagger(config, { cwd });
    let reg = await loadLatestRegistry(registryDir);
    await generate(reg!);

    // Snapshot which Robot variable name belongs to '--2'.
    reg = await loadLatestRegistry(registryDir);
    const v2Before = reg!.entries['order__button--same--2']!.locator_name;
    expect(v2Before).toBeTruthy();

    // Insert a NEW button at the top — old "--1" / "--2" become "--2" / "--3".
    await writeTemplate(`<div>
  <button>Same</button>
  <button>Same</button>
  <button>Same</button>
</div>`);

    await runTagger(config, { cwd });
    reg = await loadLatestRegistry(registryDir);
    await generate(reg!);
    reg = await loadLatestRegistry(registryDir);

    // The inserted-at-top button got '--1' (in source order). The originally
    // tagged HTML still carries the same testids it was written with — so the
    // formerly-"--2" element retains its testid (no source rewrite happened
    // because the existing testid is still valid). Robot variable carries
    // through unchanged.
    const allIds = Object.keys(reg!.entries).sort();
    const buttonIds = allIds.filter((id) => id.startsWith('order__button--'));
    expect(buttonIds).toContain('order__button--same--2');
    const v2After = reg!.entries['order__button--same--2']!.locator_name;
    expect(v2After).toBe(v2Before);
  });

  it('survives semantic edits via rename-detection (label changes still keep the variable)', async () => {
    await writeTemplate(`<div>
  <button aria-label="Speichern">x</button>
</div>`);
    const config = TaggerConfigSchema.parse({
      rootDir: 'src',
      include: ['**/*.component.html'],
      registryDir,
      testConfigurationOnly: false
    });

    await runTagger(config, { cwd });
    let reg = await loadLatestRegistry(registryDir);
    await generate(reg!);
    reg = await loadLatestRegistry(registryDir);

    const oldId = Object.keys(reg!.entries).find((id) => id.startsWith('order__button--'))!;
    const oldVar = reg!.entries[oldId]!.locator_name;
    expect(oldVar).toBeTruthy();

    // Rename label → fingerprint changes → testid changes → rename-detection
    // moves locator_name onto the new entry.
    await writeTemplate(`<div>
  <button aria-label="Sichern">x</button>
</div>`);

    await runTagger(config, { cwd });
    reg = await loadLatestRegistry(registryDir);
    await generate(reg!);
    reg = await loadLatestRegistry(registryDir);

    const liveButtonIds = Object.keys(reg!.entries).filter(
      (id) => id.startsWith('order__button--') && reg!.entries[id]!.last_seen_version === reg!.version
    );
    expect(liveButtonIds.length).toBe(1);
    expect(reg!.entries[liveButtonIds[0]!]!.locator_name).toBe(oldVar);
  });
});
