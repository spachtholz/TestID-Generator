// migrate-locators must rewrite Robot's `Variables` / `Resource` /
// `Library` import paths when the underlying locator module gets renamed
// (because the component was renamed or the componentNaming strategy
// changed). Without this, the import dangles and Robot bombs at suite
// load with `ModuleNotFoundError`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { applyRenames } from '../src/migrate/applier.js';
import { buildMigrationPlan } from '../src/migrate/plan.js';
import type { LocatorSnapshot } from '../src/migrate/snapshot.js';

function snapshot(input: {
  testidToVar: Record<string, string>;
  testidToFile: Record<string, string>;
}): LocatorSnapshot {
  const byTestid = new Map(Object.entries(input.testidToVar));
  const byVariable = new Map<string, string>();
  for (const [testid, v] of byTestid) byVariable.set(v, testid);
  const fileByTestid = new Map(Object.entries(input.testidToFile));
  const sourceFiles = [...new Set(Object.values(input.testidToFile))]
    .map((f) => `/locators/${f}`)
    .sort();
  return { byTestid, byVariable, fileByTestid, sourceFiles };
}

describe('migrate-locators path rewriting', () => {
  let robotDir = '';

  beforeEach(async () => {
    robotDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-paths-'));
  });

  afterEach(async () => {
    await fs.rm(robotDir, { recursive: true, force: true });
  });

  it('detects file-level rename when every testid moves to a new module', () => {
    const from = snapshot({
      testidToVar: {
        'order__btn--save': 'order_btn_save',
        'order__btn--cancel': 'order_btn_cancel'
      },
      testidToFile: {
        'order__btn--save': 'order.py',
        'order__btn--cancel': 'order.py'
      }
    });
    const to = snapshot({
      testidToVar: {
        'order__btn--save': 'order_btn_save',
        'order__btn--cancel': 'order_btn_cancel'
      },
      testidToFile: {
        'order__btn--save': 'order_main.py',
        'order__btn--cancel': 'order_main.py'
      }
    });

    const plan = buildMigrationPlan(from, to);
    expect(plan.fileRenames).toEqual([
      { oldFile: 'order.py', newFile: 'order_main.py' }
    ]);
    // No variable renames in this scenario - names are stable, only the
    // module they live in changed.
    expect(plan.renames).toEqual([]);
  });

  it('rewrites Variables import path in a .robot file', async () => {
    const robotFile = path.join(robotDir, 'tests.robot');
    await fs.writeFile(
      robotFile,
      [
        '*** Settings ***',
        'Variables    ../locators/order.py',
        'Resource     ../resources/common.resource',
        '',
        '*** Test Cases ***',
        'Save Order',
        '    Click    ${order_btn_save}',
        ''
      ].join('\n'),
      'utf8'
    );

    const result = await applyRenames({
      robotDir,
      renames: new Map(),
      fileRenames: [{ oldFile: 'order.py', newFile: 'order_main.py' }],
      dryRun: false
    });

    const content = await fs.readFile(robotFile, 'utf8');
    expect(content).toContain('Variables    ../locators/order_main.py');
    expect(content).not.toContain('../locators/order.py');
    // Resource line must NOT be touched - different basename.
    expect(content).toContain('Resource     ../resources/common.resource');
    expect(result.pathRewrites).toBe(1);
    expect(result.filesChanged).toBe(1);
  });

  it('rewrites Resource and Library import paths too', async () => {
    const robotFile = path.join(robotDir, 'tests.robot');
    await fs.writeFile(
      robotFile,
      [
        '*** Settings ***',
        'Variables    ../locators/order.py',
        'Resource     ../locators/order.py',
        'Library      ../locators/order.py    LIBRARY_ARG',
        ''
      ].join('\n'),
      'utf8'
    );

    const result = await applyRenames({
      robotDir,
      renames: new Map(),
      fileRenames: [{ oldFile: 'order.py', newFile: 'order_main.py' }],
      dryRun: false
    });

    const content = await fs.readFile(robotFile, 'utf8');
    expect(content).toContain('Variables    ../locators/order_main.py');
    expect(content).toContain('Resource     ../locators/order_main.py');
    expect(content).toContain('Library      ../locators/order_main.py    LIBRARY_ARG');
    expect(result.pathRewrites).toBe(3);
  });

  it('combines variable renames and file renames in one pass', async () => {
    const robotFile = path.join(robotDir, 'tests.robot');
    await fs.writeFile(
      robotFile,
      [
        '*** Settings ***',
        'Variables    ../locators/order.py',
        '',
        '*** Test Cases ***',
        'Demo',
        '    Click    ${order_btn_save_OLD}',
        ''
      ].join('\n'),
      'utf8'
    );

    const result = await applyRenames({
      robotDir,
      renames: new Map([['order_btn_save_OLD', 'order_btn_save']]),
      fileRenames: [{ oldFile: 'order.py', newFile: 'order_main.py' }],
      dryRun: false
    });

    const content = await fs.readFile(robotFile, 'utf8');
    expect(content).toContain('Variables    ../locators/order_main.py');
    expect(content).toContain('${order_btn_save}');
    expect(content).not.toContain('${order_btn_save_OLD}');
    expect(result.pathRewrites).toBe(1);
    expect(result.occurrencesChanged).toBe(1);
  });

  it('dry-run does not write but still reports the rewrite count', async () => {
    const robotFile = path.join(robotDir, 'tests.robot');
    const original = [
      '*** Settings ***',
      'Variables    ../locators/order.py',
      ''
    ].join('\n');
    await fs.writeFile(robotFile, original, 'utf8');

    const result = await applyRenames({
      robotDir,
      renames: new Map(),
      fileRenames: [{ oldFile: 'order.py', newFile: 'order_main.py' }],
      dryRun: true
    });

    const after = await fs.readFile(robotFile, 'utf8');
    expect(after).toBe(original);
    expect(result.pathRewrites).toBe(1);
    expect(result.filesChanged).toBe(1);
  });

  it('leaves unrelated paths alone (different basename)', async () => {
    const robotFile = path.join(robotDir, 'tests.robot');
    await fs.writeFile(
      robotFile,
      'Variables    ../locators/customer.py\n',
      'utf8'
    );

    const result = await applyRenames({
      robotDir,
      renames: new Map(),
      fileRenames: [{ oldFile: 'order.py', newFile: 'order_main.py' }],
      dryRun: false
    });

    expect(result.pathRewrites).toBe(0);
    expect(result.filesChanged).toBe(0);
    const content = await fs.readFile(robotFile, 'utf8');
    expect(content).toContain('customer.py');
  });
});
