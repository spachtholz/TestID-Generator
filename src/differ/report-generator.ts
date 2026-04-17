/**
 * Markdown + JSON report generators (FR-3.2, FR-3.3, NFR-9).
 *
 * The Markdown output is GitHub/GitLab-PR-comment-compatible: plain tables,
 * no HTML, no JS. Emoji are intentionally omitted (fits user preference).
 */

import { canonicalizeJson } from '../util/canonical-json.js';
import type { DiffResult } from './diff-algorithm.js';

/** Serialise the diff to canonical JSON with sorted keys (NFR-3). */
export function renderDiffJson(diff: DiffResult): string {
  return JSON.stringify(canonicalizeJson(diff), null, 2) + '\n';
}

/** Render a Markdown report suitable for a PR comment. */
export function renderDiffMarkdown(diff: DiffResult): string {
  const lines: string[] = [];
  lines.push(`# Testid Registry Diff: v${diff.from_version} → v${diff.to_version}`);
  lines.push('');
  lines.push(`_Generated at ${diff.generated_at}_`);
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Category | Count |');
  lines.push('| --- | ---: |');
  lines.push(`| unchanged | ${diff.summary.unchanged} |`);
  lines.push(`| added | ${diff.summary.added} |`);
  lines.push(`| removed | ${diff.summary.removed} |`);
  lines.push(`| renamed | ${diff.summary.renamed} |`);
  lines.push(`| modified | ${diff.summary.modified} |`);
  if (diff.summary.regenerated > 0) {
    lines.push(`| regenerated | ${diff.summary.regenerated} |`);
  }
  lines.push('');

  if (diff.renamed.length > 0) {
    lines.push('## Renamed');
    lines.push('');
    lines.push('| Old ID | New ID | Confidence | Component |');
    lines.push('| --- | --- | ---: | --- |');
    for (const r of diff.renamed) {
      lines.push(
        `| \`${r.old_id}\` | \`${r.new_id}\` | ${r.confidence.toFixed(3)} | ${r.component} |`
      );
    }
    lines.push('');
  }

  if (diff.modified.length > 0) {
    lines.push('## Modified');
    lines.push('');
    lines.push('| ID | Component | Old Fingerprint | New Fingerprint |');
    lines.push('| --- | --- | --- | --- |');
    for (const m of diff.modified) {
      lines.push(
        `| \`${m.id}\` | ${m.component} | \`${escapeCell(m.old_fingerprint)}\` | \`${escapeCell(m.new_fingerprint)}\` |`
      );
    }
    lines.push('');
  }

  if (diff.added.length > 0) {
    lines.push('## Added');
    lines.push('');
    lines.push('| ID | Component |');
    lines.push('| --- | --- |');
    for (const a of diff.added) {
      lines.push(`| \`${a.id}\` | ${a.component} |`);
    }
    lines.push('');
  }

  if (diff.removed.length > 0) {
    lines.push('## Removed');
    lines.push('');
    lines.push('| ID | Component |');
    lines.push('| --- | --- |');
    for (const r of diff.removed) {
      lines.push(`| \`${r.id}\` | ${r.component} |`);
    }
    lines.push('');
  }

  if (diff.regenerated.length > 0) {
    lines.push('## Regenerated');
    lines.push('');
    lines.push('| ID | Component | First Seen | Last Seen In | Regenerated At |');
    lines.push('| --- | --- | ---: | ---: | --- |');
    for (const r of diff.regenerated) {
      lines.push(
        `| \`${r.id}\` | ${r.component} | v${r.first_seen_version} | v${r.previous_version} | ${r.last_generated_at ?? '-'} |`
      );
    }
    lines.push('');
  }

  const components = collectAffectedComponents(diff);
  if (components.length > 0) {
    lines.push('## Affected Components');
    lines.push('');
    for (const c of components) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function escapeCell(s: string): string {
  return s.replace(/\|/g, '\\|');
}

function collectAffectedComponents(diff: DiffResult): string[] {
  const set = new Set<string>();
  for (const list of [diff.added, diff.removed, diff.regenerated] as Array<
    Array<{ component: string }>
  >) {
    for (const e of list) set.add(e.component);
  }
  for (const e of diff.modified) set.add(e.component);
  for (const e of diff.renamed) set.add(e.component);
  return Array.from(set).sort();
}
