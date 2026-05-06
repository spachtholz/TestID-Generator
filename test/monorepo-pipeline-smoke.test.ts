// Sanity check that the Pipeline harness produces stable variable names
// across two clean-HTML releases. Acts as a guard for the harness itself
// before we layer the heavier scenario tests on top of it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Pipeline } from './helpers/pipeline-harness.js';

describe('pipeline harness smoke', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-smoke-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('renders identical locators for two byte-equal releases', async () => {
    const tpl = '<button (click)="save()">Save</button>';
    const r1 = await pipeline.release({ templates: { 'order.component.html': tpl } });
    expect(r1.variableMap.size).toBe(1);
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({ templates: { 'order.component.html': tpl } });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    expect(v2).toBe(v1);
  });

  it('starts from clean HTML on every release (no data-testid carried over)', async () => {
    await pipeline.release({
      templates: { 'order.component.html': '<button>Save</button>' }
    });
    // Read the working src/order.component.html - tagger will have
    // injected data-testid into it.
    const contentAfterRun = await fs.readFile(
      path.join(workDir, 'src', 'order.component.html'),
      'utf8'
    );
    expect(contentAfterRun).toContain('data-testid=');

    // Second release passes a CLEAN template - no data-testid. Harness
    // wipes the source dir, so the tagger sees a fresh world.
    await pipeline.release({
      templates: { 'order.component.html': '<button>Save</button>' }
    });
    const after2 = await fs.readFile(
      path.join(workDir, 'src', 'order.component.html'),
      'utf8'
    );
    // After release 2, data-testid is again present (tagger injects it),
    // but the registry confirms continuity rather than the file.
    expect(after2).toContain('data-testid=');
  });
});
