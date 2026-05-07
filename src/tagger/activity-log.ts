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
  /** write activity.v{N}.md (and activity.latest.md if writeLatest). default true */
  markdown?: boolean;
  /** write activity.v{N}.json (and activity.latest.json if writeLatest). default true */
  json?: boolean;
  /** also write activity.latest.{md,json} alongside the versioned files. default true */
  writeLatest?: boolean;
  /** keep only newest N versioned activity files per format; 0 = keep all */
  retention?: number;
}

export interface WriteActivityResult {
  markdownPath: string | null;
  jsonPath: string | null;
  latestMarkdownPath: string | null;
  latestJsonPath: string | null;
}

const VERSIONED_ACTIVITY_PATTERN = /^activity\.v(\d+)\.(md|json)$/;

/**
 * Persist activity files next to the registry. By default writes
 * `activity.v{N}.md`, `activity.v{N}.json`, `activity.latest.md` and
 * `activity.latest.json`. Each format and the latest pointer can be toggled
 * independently. Older versioned files are pruned when `retention > 0`.
 */
export async function writeActivityReport(
  options: WriteActivityOptions
): Promise<WriteActivityResult> {
  const { dir, report } = options;
  const wantMarkdown = options.markdown ?? true;
  const wantJson = options.json ?? true;
  const writeLatest = options.writeLatest ?? true;
  const retention = options.retention ?? 0;

  await fs.mkdir(dir, { recursive: true });

  const markdownContent = wantMarkdown ? renderActivityMarkdown(report) : null;
  const jsonContent = wantJson ? JSON.stringify(report, null, 2) + '\n' : null;

  let markdownPath: string | null = null;
  let jsonPath: string | null = null;
  let latestMarkdownPath: string | null = null;
  let latestJsonPath: string | null = null;

  if (markdownContent !== null) {
    markdownPath = path.join(dir, `activity.v${report.version}.md`);
    await fs.writeFile(markdownPath, markdownContent, 'utf8');
    if (writeLatest) {
      latestMarkdownPath = path.join(dir, 'activity.latest.md');
      await fs.writeFile(latestMarkdownPath, markdownContent, 'utf8');
    }
  }
  if (jsonContent !== null) {
    jsonPath = path.join(dir, `activity.v${report.version}.json`);
    await fs.writeFile(jsonPath, jsonContent, 'utf8');
    if (writeLatest) {
      latestJsonPath = path.join(dir, 'activity.latest.json');
      await fs.writeFile(latestJsonPath, jsonContent, 'utf8');
    }
  }

  if (retention > 0) {
    await pruneOldActivityFiles(dir, retention);
  }

  return { markdownPath, jsonPath, latestMarkdownPath, latestJsonPath };
}

/**
 * Keep only the newest `keep` versions of activity.v{N}.{md,json}. Each format
 * is pruned independently so disabling one format mid-lifetime does not delete
 * the other format's older files. The `activity.latest.*` pointers are never
 * pruned.
 */
async function pruneOldActivityFiles(dir: string, keep: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const buckets: Record<'md' | 'json', { name: string; version: number }[]> = {
    md: [],
    json: []
  };
  for (const name of entries) {
    const match = VERSIONED_ACTIVITY_PATTERN.exec(name);
    if (!match) continue;
    const version = Number.parseInt(match[1]!, 10);
    if (!Number.isFinite(version)) continue;
    const ext = match[2] as 'md' | 'json';
    buckets[ext].push({ name, version });
  }

  for (const list of Object.values(buckets)) {
    if (list.length <= keep) continue;
    list.sort((a, b) => b.version - a.version);
    const toDelete = list.slice(keep);
    await Promise.all(
      toDelete.map((entry) =>
        fs.unlink(path.join(dir, entry.name)).catch(() => undefined)
      )
    );
  }
}
