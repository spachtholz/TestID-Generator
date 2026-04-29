import { describe, it, expect } from 'vitest';
import { buildMigrationPlan } from '../src/migrate/plan.js';
import type { LocatorSnapshot } from '../src/migrate/snapshot.js';

function snapshot(pairs: [string, string][]): LocatorSnapshot {
  const byTestid = new Map<string, string>();
  const byVariable = new Map<string, string>();
  for (const [testid, variable] of pairs) {
    byTestid.set(testid, variable);
    byVariable.set(variable, testid);
  }
  return { byTestid, byVariable, sourceFiles: [] };
}

describe('buildMigrationPlan', () => {
  it('reports zero changes for identical snapshots', () => {
    const a = snapshot([['t1', 'orderButton']]);
    const b = snapshot([['t1', 'orderButton']]);
    const plan = buildMigrationPlan(a, b);
    expect(plan.renames).toHaveLength(0);
    expect(plan.orphans).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
    expect(plan.added).toBe(0);
  });

  it('detects a simple rename via shared testid', () => {
    const a = snapshot([['t1', 'order_button']]);
    const b = snapshot([['t1', 'order_buttons']]);
    const plan = buildMigrationPlan(a, b);
    expect(plan.renames).toEqual([
      { testid: 't1', oldVariable: 'order_button', newVariable: 'order_buttons' }
    ]);
    expect(plan.unchanged).toBe(0);
  });

  it('reports orphans for testids that disappear', () => {
    const a = snapshot([['t1', 'gone'], ['t2', 'staying']]);
    const b = snapshot([['t2', 'staying']]);
    const plan = buildMigrationPlan(a, b);
    expect(plan.orphans).toEqual([{ testid: 't1', oldVariable: 'gone' }]);
    expect(plan.renames).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it('counts purely-added entries without flagging them as renames', () => {
    const a = snapshot([['t1', 'a']]);
    const b = snapshot([['t1', 'a'], ['t2', 'newcomer']]);
    const plan = buildMigrationPlan(a, b);
    expect(plan.renames).toHaveLength(0);
    expect(plan.added).toBe(1);
  });

  it('flags multiple-old-to-same-new conflict', () => {
    const a = snapshot([['t1', 'one'], ['t2', 'two']]);
    const b = snapshot([['t1', 'merged'], ['t2', 'merged']]);
    const plan = buildMigrationPlan(a, b);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]!.kind).toBe('multiple-old-to-same-new');
    expect(plan.conflicts[0]!.affected).toHaveLength(2);
  });

  it('flags new-name-was-different-old conflict', () => {
    const a = snapshot([
      ['t1', 'order_button'],
      ['t2', 'order_buttons']
    ]);
    const b = snapshot([
      ['t1', 'order_buttons'],
      ['t2', 'order_buttons_v2']
    ]);
    const plan = buildMigrationPlan(a, b);
    const reuseConflict = plan.conflicts.find(
      (c) => c.kind === 'new-name-was-different-old'
    );
    expect(reuseConflict).toBeDefined();
    expect(reuseConflict!.newVariable).toBe('order_buttons');
  });
});
