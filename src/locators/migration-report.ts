// Renders MigrationReport into human-readable text + sed-snippets.
// The shell snippets target ripgrep + GNU sed; on Windows users typically run
// these in WSL or Git Bash.

import type { MigrationReport } from './types.js';

export function renderMigrationReport(report: MigrationReport): string {
  if (report.entries.length === 0 && report.orphanFiles.length === 0) {
    return 'No migration needed: component naming matches the previous run.\n';
  }

  const lines: string[] = [];
  lines.push('# Locator migration report');
  lines.push('');

  if (report.entries.length > 0) {
    const totalVars = report.entries.reduce((n, e) => n + e.variables.length, 0);
    lines.push(`${report.entries.length} component(s) renamed, ${totalVars} variable(s) affected.`);
    lines.push('');

    for (const entry of report.entries) {
      lines.push(`## ${entry.componentPath}`);
      lines.push(`  file: ${entry.oldFilename}  ->  ${entry.newFilename}`);
      if (entry.variables.length === 0) {
        lines.push('  (component label changed, but no variable renames)');
      } else {
        for (const v of entry.variables) {
          lines.push(`  ${v.oldVariable}  ->  ${v.newVariable}`);
        }
      }
      lines.push('');
    }

    lines.push('## Apply with sed');
    lines.push('');
    lines.push('Run from your test-suite root (adjust the glob to match your layout):');
    lines.push('');
    for (const entry of report.entries) {
      for (const v of entry.variables) {
        const escapedOld = escapeForSed(v.oldVariable);
        const escapedNew = escapeForSed(v.newVariable);
        lines.push(
          `  rg -l '\\b${escapedOld}\\b' tests/ | xargs sed -i 's/\\b${escapedOld}\\b/${escapedNew}/g'`
        );
      }
    }
    lines.push('');
  }

  if (report.orphanFiles.length > 0) {
    lines.push('## Orphan locator files');
    lines.push('');
    lines.push('These were written by a previous run but no longer correspond to any component.');
    lines.push('Delete them after verifying nothing imports them:');
    lines.push('');
    for (const f of report.orphanFiles) lines.push(`  ${f}`);
    lines.push('');
  }

  return lines.join('\n');
}

function escapeForSed(input: string): string {
  return input.replace(/[/\\.&]/g, (c) => `\\${c}`);
}
