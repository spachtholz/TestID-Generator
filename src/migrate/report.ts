import * as path from 'node:path';
import type { MigrationPlan } from './plan.js';
import type { ReferenceHit } from './scanner.js';

export interface RenderArgs {
  plan: MigrationPlan;
  hits: ReferenceHit[];
  orphanHits: ReferenceHit[];
  filesChanged: number;
  occurrencesChanged: number;
  dryRun: boolean;
  robotDir: string;
}

export function renderMigrationReport(args: RenderArgs): string {
  const { plan, hits, orphanHits, filesChanged, occurrencesChanged, dryRun, robotDir } = args;
  const lines: string[] = [];
  lines.push('# Locator migration report');
  lines.push('');

  if (
    plan.renames.length === 0 &&
    plan.orphans.length === 0 &&
    plan.conflicts.length === 0
  ) {
    lines.push('No changes detected: every testid maps to the same variable name.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(
    `Renames: ${plan.renames.length}  ` +
      `Orphans: ${plan.orphans.length}  ` +
      `Conflicts: ${plan.conflicts.length}  ` +
      `Added: ${plan.added}  ` +
      `Unchanged: ${plan.unchanged}`
  );
  lines.push('');

  if (plan.renames.length > 0) {
    lines.push('## Renames');
    lines.push('');
    const byVariable = groupHitsByVariable(hits);
    for (const r of plan.renames) {
      const fileMap = byVariable.get(r.oldVariable) ?? new Map();
      const total = sumOccurrences(fileMap);
      lines.push(`  ${r.oldVariable}  ->  ${r.newVariable}   (${total} occurrence(s))`);
      for (const [file, count] of fileMap) {
        lines.push(`    ${path.relative(robotDir, file)}  (${count})`);
      }
    }
    lines.push('');
  }

  if (plan.orphans.length > 0) {
    lines.push('## Orphans (testid no longer present, manual review needed)');
    lines.push('');
    const orphanByVariable = groupHitsByVariable(orphanHits);
    for (const o of plan.orphans) {
      const fileMap = orphanByVariable.get(o.oldVariable) ?? new Map();
      const total = sumOccurrences(fileMap);
      const stillUsed = total > 0 ? ` STILL REFERENCED (${total})` : '';
      lines.push(`  ${o.oldVariable}  (testid: ${o.testid})${stillUsed}`);
      for (const [file, count] of fileMap) {
        lines.push(`    ${path.relative(robotDir, file)}  (${count})`);
      }
    }
    lines.push('');
  }

  if (plan.conflicts.length > 0) {
    lines.push('## Conflicts (warnings, not blocking)');
    lines.push('');
    for (const c of plan.conflicts) {
      lines.push(`  [${c.kind}] ${c.detail}`);
      for (const a of c.affected) {
        lines.push(`    testid=${a.testid}  oldVariable=${a.oldVariable}`);
      }
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(
    `  ${dryRun ? 'Would update' : 'Updated'} ${filesChanged} file(s), ` +
      `${occurrencesChanged} occurrence(s).`
  );
  if (dryRun) {
    lines.push('  (dry-run: re-run with --apply to write the changes)');
  }
  lines.push('');

  return lines.join('\n');
}

function groupHitsByVariable(hits: ReferenceHit[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const h of hits) {
    const fileMap = out.get(h.variable) ?? new Map<string, number>();
    fileMap.set(h.file, (fileMap.get(h.file) ?? 0) + 1);
    out.set(h.variable, fileMap);
  }
  return out;
}

function sumOccurrences(fileMap: Map<string, number>): number {
  let n = 0;
  for (const v of fileMap.values()) n += v;
  return n;
}
