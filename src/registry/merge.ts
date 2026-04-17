/**
 * Merge freshly-observed tagger entries with registry history.
 *
 * The tagger produces a raw entry per tagged element (no version metadata).
 * This module decides what happens to each entry in the new registry version:
 *
 *   - **carried-over** — id was in the previous (latest) registry. Preserve
 *     `first_seen_version`, `last_generated_at`, `generation_history`; only
 *     bump `last_seen_version`.
 *   - **regenerated** — id was absent in the previous registry but existed in
 *     an older one. Preserve `first_seen_version`, append the current version
 *     to `generation_history`, and set `last_generated_at` to now.
 *   - **new** — id never appeared in any registry version. Initialize every
 *     history field against the current version.
 *
 * The output of this module goes directly into the Registry's `entries` map.
 */

import type { Registry, RegistryEntry } from './schema.js';
import type { HistoryMap } from './history.js';

/**
 * Classification of how a single entry ended up in the new version — useful
 * for the tagger to render an activity log and for callers that want to
 * emit stderr lines beyond aggregate stats.
 */
export type MergeDisposition = 'carried-over' | 'regenerated' | 'new';

export interface MergedEntryInfo {
  entry: RegistryEntry;
  disposition: MergeDisposition;
  /** For `regenerated`: the version at which the id last existed before this run. */
  previousVersion?: number;
}

export interface MergeOptions {
  previous: Registry | null;
  history: HistoryMap;
  newEntries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>>;
  nextVersion: number;
  /** ISO timestamp stamped on any entry that is created or regenerated. */
  now: string;
}

/**
 * Merge one version's raw entries into the existing history. Returns both the
 * ready-to-persist entries map and a per-id disposition record so callers can
 * report what happened without re-running the classifier.
 */
export function mergeEntriesWithHistory(
  options: MergeOptions
): { merged: Record<string, RegistryEntry>; dispositions: Map<string, MergedEntryInfo> } {
  const { previous, history, newEntries, nextVersion, now } = options;
  const merged: Record<string, RegistryEntry> = {};
  const dispositions = new Map<string, MergedEntryInfo>();

  for (const [id, incoming] of Object.entries(newEntries)) {
    const carried = previous?.entries?.[id];
    const historical = history.get(id);

    if (carried) {
      merged[id] = continueCarryOver(incoming, carried, nextVersion);
      dispositions.set(id, { entry: merged[id]!, disposition: 'carried-over' });
      continue;
    }

    if (historical) {
      merged[id] = continueAfterGap(incoming, historical, nextVersion, now);
      dispositions.set(id, {
        entry: merged[id]!,
        disposition: 'regenerated',
        previousVersion: historical.latest_recorded_version
      });
      continue;
    }

    merged[id] = createFresh(incoming, nextVersion, now);
    dispositions.set(id, { entry: merged[id]!, disposition: 'new' });
  }

  return { merged, dispositions };
}

/** The entry was in the previous latest registry — inherit all history fields. */
function continueCarryOver(
  incoming: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>,
  carried: RegistryEntry,
  nextVersion: number
): RegistryEntry {
  return {
    ...incoming,
    first_seen_version: carried.first_seen_version,
    last_seen_version: nextVersion,
    last_generated_at: carried.last_generated_at,
    generation_history: carried.generation_history ?? [carried.first_seen_version]
  };
}

/** The entry was absent in the previous registry but present in an older one. */
function continueAfterGap(
  incoming: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>,
  historical: { first_seen_version: number; generation_history: number[] },
  nextVersion: number,
  now: string
): RegistryEntry {
  return {
    ...incoming,
    first_seen_version: historical.first_seen_version,
    last_seen_version: nextVersion,
    last_generated_at: now,
    generation_history: [...historical.generation_history, nextVersion]
  };
}

/** The entry has never appeared in any version — initialize its history. */
function createFresh(
  incoming: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>,
  nextVersion: number,
  now: string
): RegistryEntry {
  return {
    ...incoming,
    first_seen_version: nextVersion,
    last_seen_version: nextVersion,
    last_generated_at: now,
    generation_history: [nextVersion]
  };
}
