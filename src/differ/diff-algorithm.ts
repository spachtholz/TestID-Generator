// Diff two registries into unchanged/added/removed/renamed/modified (FR-3.x).
// Rename detection uses best-of-best similarity matching with a threshold.

import type { Registry, RegistryEntry } from '../registry/index.js';
import { entrySimilarity } from './similarity.js';

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.8;

export type DiffCategory =
  | 'unchanged'
  | 'added'
  | 'removed'
  | 'renamed'
  | 'modified'
  | 'regenerated';

export interface UnchangedEntry {
  id: string;
  component: string;
}

export interface ModifiedEntry {
  id: string;
  component: string;
  old_fingerprint: string;
  new_fingerprint: string;
}

export interface RenamedEntry {
  old_id: string;
  new_id: string;
  confidence: number;
  component: string;
}

export interface SimpleEntry {
  id: string;
  component: string;
  fingerprint: string;
}

export interface RegeneratedEntry extends SimpleEntry {
  /** Registry version the id was most recently present in before this run. */
  previous_version: number;
  /** Registry version the id first ever appeared in. */
  first_seen_version: number;
  /** ISO timestamp of the regeneration, if recorded by the tagger. */
  last_generated_at?: string;
}

export interface DiffSummary {
  unchanged: number;
  added: number;
  removed: number;
  renamed: number;
  modified: number;
  regenerated: number;
}

export interface DiffResult {
  from_version: number;
  to_version: number;
  generated_at: string;
  summary: DiffSummary;
  unchanged: UnchangedEntry[];
  added: SimpleEntry[];
  removed: SimpleEntry[];
  renamed: RenamedEntry[];
  modified: ModifiedEntry[];
  regenerated: RegeneratedEntry[];
}

export interface DiffOptions {
  /** min similarity for a rename, default 0.8 */
  threshold?: number;
  now?: string;
  /** split `added` into new vs regenerated (ids seen in earlier versions) */
  showRegenerated?: boolean;
}

export function diffRegistries(
  oldReg: Registry,
  newReg: Registry,
  options: DiffOptions = {}
): DiffResult {
  const threshold = options.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const now = options.now ?? '1970-01-01T00:00:00Z';

  const unchanged: UnchangedEntry[] = [];
  const modified: ModifiedEntry[] = [];

  // exact-id overlap first
  const oldOnly = new Map<string, RegistryEntry>();
  const newOnly = new Map<string, RegistryEntry>();
  for (const [id, entry] of Object.entries(oldReg.entries)) {
    oldOnly.set(id, entry);
  }
  for (const [id, entry] of Object.entries(newReg.entries)) {
    if (oldOnly.has(id)) {
      const oldEntry = oldOnly.get(id)!;
      if (oldEntry.fingerprint === entry.fingerprint) {
        unchanged.push({ id, component: entry.component });
      } else {
        modified.push({
          id,
          component: entry.component,
          old_fingerprint: oldEntry.fingerprint,
          new_fingerprint: entry.fingerprint
        });
      }
      oldOnly.delete(id);
    } else {
      newOnly.set(id, entry);
    }
  }

  // rename detection: best new-only candidate per old-only id, 1:1 only
  type Candidate = { oldId: string; newId: string; score: number };
  const candidates: Candidate[] = [];
  for (const [oldId, oldEntry] of oldOnly) {
    let best: Candidate | null = null;
    for (const [newId, newEntry] of newOnly) {
      const score = entrySimilarity(oldEntry, newEntry);
      if (score >= threshold && (!best || score > best.score)) {
        best = { oldId, newId, score };
      }
    }
    if (best) candidates.push(best);
  }

  // two old-ids -> same new-id: keep the higher score
  candidates.sort((a, b) => b.score - a.score);
  const takenOld = new Set<string>();
  const takenNew = new Set<string>();
  const renamed: RenamedEntry[] = [];
  for (const c of candidates) {
    if (takenOld.has(c.oldId) || takenNew.has(c.newId)) continue;
    takenOld.add(c.oldId);
    takenNew.add(c.newId);
    const newEntry = newReg.entries[c.newId]!;
    renamed.push({
      old_id: c.oldId,
      new_id: c.newId,
      confidence: round3(c.score),
      component: newEntry.component
    });
  }

  const showRegenerated = options.showRegenerated ?? false;
  const added: SimpleEntry[] = [];
  const regenerated: RegeneratedEntry[] = [];
  for (const [newId, entry] of newOnly) {
    if (takenNew.has(newId)) continue;
    if (showRegenerated && isRegeneration(entry, newReg.version)) {
      const history = entry.generation_history ?? [newReg.version];
      regenerated.push({
        id: newId,
        component: entry.component,
        fingerprint: entry.fingerprint,
        first_seen_version: entry.first_seen_version,
        previous_version: history[history.length - 2] ?? entry.first_seen_version,
        last_generated_at: entry.last_generated_at
      });
    } else {
      added.push({ id: newId, component: entry.component, fingerprint: entry.fingerprint });
    }
  }
  const removed: SimpleEntry[] = [];
  for (const [oldId, entry] of oldOnly) {
    if (takenOld.has(oldId)) continue;
    removed.push({ id: oldId, component: entry.component, fingerprint: entry.fingerprint });
  }

  // Deterministic output ordering (NFR-3).
  unchanged.sort((a, b) => a.id.localeCompare(b.id));
  modified.sort((a, b) => a.id.localeCompare(b.id));
  renamed.sort((a, b) => a.old_id.localeCompare(b.old_id));
  added.sort((a, b) => a.id.localeCompare(b.id));
  removed.sort((a, b) => a.id.localeCompare(b.id));
  regenerated.sort((a, b) => a.id.localeCompare(b.id));

  return {
    from_version: oldReg.version,
    to_version: newReg.version,
    generated_at: now,
    summary: {
      unchanged: unchanged.length,
      added: added.length,
      removed: removed.length,
      renamed: renamed.length,
      modified: modified.length,
      regenerated: regenerated.length
    },
    unchanged,
    added,
    removed,
    renamed,
    modified,
    regenerated
  };
}

/**
 * An id counts as regenerated if its `generation_history` - set by the
 * tagger's merge step - lists a version *earlier* than the current one. That
 * means the id was present before, disappeared, and came back. Entries whose
 * history is a single-element list are plain `added`.
 */
function isRegeneration(entry: RegistryEntry, currentVersion: number): boolean {
  const history = entry.generation_history;
  if (!history || history.length < 2) return false;
  return history.some((v) => v < currentVersion);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Translate a diff into a process exit code per FR-3.5.
 *   0 → no changes, or only `added`
 *   1 → something changed that requires review (removed / renamed / modified)
 *   2 → registry error (raised by the caller, not here)
 */
export function exitCodeForDiff(diff: DiffResult): 0 | 1 {
  if (
    diff.summary.removed > 0 ||
    diff.summary.renamed > 0 ||
    diff.summary.modified > 0
  ) {
    return 1;
  }
  return 0;
}
