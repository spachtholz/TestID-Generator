import type { LocatorSnapshot } from './snapshot.js';

export interface RenameEntry {
  testid: string;
  oldVariable: string;
  newVariable: string;
}

export interface OrphanedEntry {
  testid: string;
  oldVariable: string;
}

export type ConflictKind =
  | 'multiple-old-to-same-new'
  | 'new-name-was-different-old';

export interface Conflict {
  kind: ConflictKind;
  newVariable: string;
  affected: { testid: string; oldVariable: string }[];
  detail: string;
}

export interface MigrationPlan {
  renames: RenameEntry[];
  orphans: OrphanedEntry[];
  added: number;
  unchanged: number;
  conflicts: Conflict[];
}

export function buildMigrationPlan(
  from: LocatorSnapshot,
  to: LocatorSnapshot
): MigrationPlan {
  const renames: RenameEntry[] = [];
  const orphans: OrphanedEntry[] = [];
  let unchanged = 0;

  for (const [testid, oldVariable] of from.byTestid) {
    const newVariable = to.byTestid.get(testid);
    if (newVariable === undefined) {
      orphans.push({ testid, oldVariable });
      continue;
    }
    if (newVariable === oldVariable) {
      unchanged++;
      continue;
    }
    renames.push({ testid, oldVariable, newVariable });
  }

  let added = 0;
  for (const testid of to.byTestid.keys()) {
    if (!from.byTestid.has(testid)) added++;
  }

  renames.sort((a, b) => a.oldVariable.localeCompare(b.oldVariable));
  orphans.sort((a, b) => a.oldVariable.localeCompare(b.oldVariable));

  const conflicts = detectConflicts(renames, from);

  return { renames, orphans, added, unchanged, conflicts };
}

function detectConflicts(renames: RenameEntry[], from: LocatorSnapshot): Conflict[] {
  const conflicts: Conflict[] = [];

  const byNew = new Map<string, RenameEntry[]>();
  for (const r of renames) {
    const list = byNew.get(r.newVariable) ?? [];
    list.push(r);
    byNew.set(r.newVariable, list);
  }
  for (const [newVariable, group] of byNew) {
    if (group.length > 1) {
      conflicts.push({
        kind: 'multiple-old-to-same-new',
        newVariable,
        affected: group.map((g) => ({ testid: g.testid, oldVariable: g.oldVariable })),
        detail: `${group.length} old names collapse onto "${newVariable}". Pick one or rename manually.`
      });
    }
  }

  for (const r of renames) {
    const otherTestid = from.byVariable.get(r.newVariable);
    if (otherTestid !== undefined && otherTestid !== r.testid) {
      conflicts.push({
        kind: 'new-name-was-different-old',
        newVariable: r.newVariable,
        affected: [
          { testid: r.testid, oldVariable: r.oldVariable },
          { testid: otherTestid, oldVariable: r.newVariable }
        ],
        detail:
          `"${r.newVariable}" already existed in the old set for testid "${otherTestid}". ` +
          `Replacing references will silently retarget callers that used "${r.newVariable}" before.`
      });
    }
  }

  return conflicts;
}
