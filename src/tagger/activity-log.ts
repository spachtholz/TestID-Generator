// Per-run activity log: which ids are new, carried over, regenerated, or
// manually overridden. Opt-in via `--verbose` or `writeActivityLog: true`.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { MergedEntryInfo } from '../registry/merge.js';

export type ActivityKind =
  | 'new'
  | 'regenerated'
  | 'carried-over'
  | 'manual-override';

export interface ActivityRecord {
  id: string;
  component: string;
  kind: ActivityKind;
  source: 'generated' | 'manual';
  /** regenerated: version the id was last seen in */
  previousVersion?: number;
  generatedAt?: string;
}

export interface ActivityReport {
  version: number;
  generatedAt: string;
  records: ActivityRecord[];
}

export function buildActivityReport(input: {
  version: number;
  generatedAt: string;
  dispositions: Map<string, MergedEntryInfo>;
  manualOverrideIds: Set<string>;
}): ActivityReport {
  const records: ActivityRecord[] = [];
  for (const [id, info] of input.dispositions) {
    const source = info.entry.source ?? 'generated';
    const isManualOverride = input.manualOverrideIds.has(id);
    records.push({
      id,
      component: info.entry.component,
      kind: isManualOverride ? 'manual-override' : info.disposition,
      source,
      previousVersion: info.previousVersion,
      generatedAt: info.entry.last_generated_at
    });
  }
  records.sort((a, b) =>
    a.component.localeCompare(b.component) || a.id.localeCompare(b.id)
  );
  return { version: input.version, generatedAt: input.generatedAt, records };
}

/** Render the report as Markdown suitable for a PR comment or local review. */
export function renderActivityMarkdown(report: ActivityReport): string {
  const byKind: Record<ActivityKind, ActivityRecord[]> = {
    new: [],
    regenerated: [],
    'manual-override': [],
    'carried-over': []
  };
  for (const r of report.records) byKind[r.kind].push(r);

  const lines: string[] = [];
  lines.push(`# Tagger Activity - v${report.version}`);
  lines.push('');
  lines.push(`_Generated at ${report.generatedAt}_`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Kind | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| new | ${byKind.new.length} |`);
  lines.push(`| regenerated | ${byKind.regenerated.length} |`);
  lines.push(`| manual-override | ${byKind['manual-override'].length} |`);
  lines.push(`| carried-over | ${byKind['carried-over'].length} |`);
  lines.push('');

  appendSection(lines, '## New', byKind.new, (r) =>
    `- \`${r.id}\` - ${r.component} (${r.source})`
  );
  appendSection(lines, '## Regenerated', byKind.regenerated, (r) =>
    `- \`${r.id}\` - ${r.component} (last seen in v${r.previousVersion}, re-generated at ${r.generatedAt ?? 'n/a'})`
  );
  appendSection(lines, '## Manual Override', byKind['manual-override'], (r) =>
    `- \`${r.id}\` - ${r.component}`
  );

  // Carried-over is the boring majority - we do not dump it inline; summary count is enough.
  lines.push('');
  return lines.join('\n');
}

function appendSection(
  lines: string[],
  heading: string,
  records: ActivityRecord[],
  render: (r: ActivityRecord) => string
): void {
  if (records.length === 0) return;
  lines.push(heading);
  lines.push('');
  for (const r of records) lines.push(render(r));
  lines.push('');
}

export interface WriteActivityOptions {
  dir: string;
  report: ActivityReport;
}

export interface WriteActivityResult {
  markdownPath: string;
  jsonPath: string;
}

/** Persist `activity.v{N}.md` + `activity.v{N}.json` next to the registry. */
export async function writeActivityReport(
  options: WriteActivityOptions
): Promise<WriteActivityResult> {
  const { dir, report } = options;
  await fs.mkdir(dir, { recursive: true });
  const markdownPath = path.join(dir, `activity.v${report.version}.md`);
  const jsonPath = path.join(dir, `activity.v${report.version}.json`);
  await fs.writeFile(markdownPath, renderActivityMarkdown(report), 'utf8');
  await fs.writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return { markdownPath, jsonPath };
}
