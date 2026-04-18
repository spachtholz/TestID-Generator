import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../src/tagger/config-loader.js';
import { rollbackLatestRun } from '../src/rollback/rollback.js';
import { loadLatestRegistry } from '../src/registry/loader.js';

let workDir = '';
const config = { ...DEFAULT_CONFIG, testConfigurationOnly: false, rootDir: 'src' };

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-rollback-'));
  await fs.mkdir(path.join(workDir, 'src'), { recursive: true });
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('rollbackLatestRun', () => {
  const templatePath = () => path.join(workDir, 'src', 'hello.component.html');
  const registryDir = () => path.join(workDir, 'test-artifacts/testids');

  it('reports nothing to undo when no backup exists', async () => {
    const result = await rollbackLatestRun({ registryDir: registryDir() });
    expect(result.rolledBackVersion).toBeNull();
    expect(result.restoredFiles).toEqual([]);
  });

  it('restores the template, deletes the new registry version and removes latest.json after the first run', async () => {
    const originalContent = `<button type="submit">Send</button>`;
    await fs.writeFile(templatePath(), originalContent);

    await runTagger(config, { cwd: workDir });
    const tagged = await fs.readFile(templatePath(), 'utf8');
    expect(tagged).toContain('data-testid=');
    expect(tagged).not.toBe(originalContent);

    const result = await rollbackLatestRun({ registryDir: registryDir() });
    expect(result.rolledBackVersion).toBe(1);
    expect(result.restoredFiles).toEqual([templatePath()]);
    expect(result.restoredToVersion).toBeNull();

    const restored = await fs.readFile(templatePath(), 'utf8');
    expect(restored).toBe(originalContent);

    // v1 registry + latest.json must be gone; the backup folder as well.
    await expect(fs.access(path.join(registryDir(), 'testids.v1.json'))).rejects.toThrow();
    await expect(fs.access(path.join(registryDir(), 'testids.latest.json'))).rejects.toThrow();
    await expect(fs.access(path.join(registryDir(), 'backup.v1'))).rejects.toThrow();
  });

  it('rewinds latest.json to v(N-1) after rolling back a second run', async () => {
    await fs.writeFile(templatePath(), `<button type="submit">Send</button>`);
    await runTagger(config, { cwd: workDir });

    // Modify the template so the second run actually produces a new version.
    await fs.writeFile(templatePath(), `<button type="submit">Send now</button>`);
    await runTagger(config, { cwd: workDir });

    const beforeRollback = await loadLatestRegistry(registryDir());
    expect(beforeRollback?.version).toBe(2);

    const result = await rollbackLatestRun({ registryDir: registryDir() });
    expect(result.rolledBackVersion).toBe(2);
    expect(result.restoredToVersion).toBe(1);

    const afterRollback = await loadLatestRegistry(registryDir());
    expect(afterRollback?.version).toBe(1);
  });

  it('leaves everything unchanged on dry-run', async () => {
    await fs.writeFile(templatePath(), `<button type="submit">Send</button>`);
    await runTagger(config, { cwd: workDir });
    const taggedContent = await fs.readFile(templatePath(), 'utf8');

    const result = await rollbackLatestRun({ registryDir: registryDir(), dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.rolledBackVersion).toBe(1);
    expect(await fs.readFile(templatePath(), 'utf8')).toBe(taggedContent);
    await expect(fs.access(path.join(registryDir(), 'testids.v1.json'))).resolves.toBeUndefined();
  });

  it('skips backup writes when writeBackups is disabled', async () => {
    await fs.writeFile(templatePath(), `<button type="submit">Send</button>`);
    await runTagger({ ...config, writeBackups: false }, { cwd: workDir });

    await expect(fs.access(path.join(registryDir(), 'backup.v1'))).rejects.toThrow();
    const result = await rollbackLatestRun({ registryDir: registryDir() });
    expect(result.rolledBackVersion).toBeNull();
  });
});
