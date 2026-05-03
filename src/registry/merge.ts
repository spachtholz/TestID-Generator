// Classify each incoming entry as carried-over / regenerated / new based on
// its appearance history, and stamp the corresponding version/time metadata.

import type { Registry, RegistryEntry } from './schema.js';
import type { HistoryMap } from './history.js';
import { entrySimilarity } from '../differ/similarity.js';

export type MergeDisposition = 'carried-over' | 'regenerated' | 'new';

export interface MergedEntryInfo {
  entry: RegistryEntry;
  disposition: MergeDisposition;
  /** regenerated: version in which the id last existed before this run */
  previousVersion?: number;
  /**
   * When the 'new' entry inherited its locator_name from a removed previous
   * entry via the rename-detection pass, this points at the source testid.
   * Useful for logging and for tests.
   */
  renamedFrom?: string;
}

export interface MergeOptions {
  previous: Registry | null;
  history: HistoryMap;
  newEntries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>>;
  nextVersion: number;
  now: string;
  /**
   * Minimum similarity (0.1..1.0) required to transfer a removed entry's
   * `locator_name` onto a new entry. Defaults to 0.8, matching the differ.
   */
  renameThreshold?: number;
}

export const DEFAULT_RENAME_THRESHOLD = 0.8;

export function mergeEntriesWithHistory(
  options: MergeOptions
): { merged: Record<string, RegistryEntry>; dispositions: Map<string, MergedEntryInfo> } {
  const { previous, history, newEntries, nextVersion, now } = options;
  const renameThreshold = options.renameThreshold ?? DEFAULT_RENAME_THRESHOLD;
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

  // Rename-aware locator_name carry-over. When a fingerprint-relevant field
  // changes (aria-label rewording, formcontrolname rename), the regenerated
  // testid string no longer matches the previous key — the merge above
  // classifies it as 'new' and the old entry becomes 'removed'. Walk the
  // new entries once more and hand down the removed entry's locator_name
  // whenever the two look semantically close.
  if (previous) {
    transferLocatorNamesOnRename({
      previous,
      incomingIds: new Set(Object.keys(newEntries)),
      dispositions,
      threshold: renameThreshold
    });
  }

  return { merged, dispositions };
}

interface RenameTransferArgs {
  previous: Registry;
  incomingIds: Set<string>;
  dispositions: Map<string, MergedEntryInfo>;
  threshold: number;
}

function transferLocatorNamesOnRename(args: RenameTransferArgs): void {
  const { previous, incomingIds, dispositions, threshold } = args;

  // Candidates are previous entries not present in the incoming set that
  // actually hold a locator_name worth preserving.
  const candidates: { id: string; entry: RegistryEntry }[] = [];
  for (const [prevId, prevEntry] of Object.entries(previous.entries)) {
    if (incomingIds.has(prevId)) continue;
    if (prevEntry.locator_name === undefined) continue;
    candidates.push({ id: prevId, entry: prevEntry });
  }
  if (candidates.length === 0) return;

  // Greedy best-match. Process new entries in sorted id order so the outcome
  // is deterministic even if Object.entries iteration order shifts.
  const newIds = [...dispositions.entries()]
    .filter(([, info]) => info.disposition === 'new' && info.entry.locator_name === undefined)
    .map(([id]) => id)
    .sort();
  const usedCandidates = new Set<string>();

  for (const id of newIds) {
    const info = dispositions.get(id)!;
    let best: { id: string; score: number } | null = null;
    for (const cand of candidates) {
      if (usedCandidates.has(cand.id)) continue;
      const score = entrySimilarity(info.entry, cand.entry);
      if (score >= threshold && (best === null || score > best.score)) {
        best = { id: cand.id, score };
      }
    }
    if (best) {
      const donor = previous.entries[best.id]!;
      info.entry.locator_name = donor.locator_name;
      info.renamedFrom = best.id;
      usedCandidates.add(best.id);
    }
  }
}

function continueCarryOver(
  incoming: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>,
  carried: RegistryEntry,
  nextVersion: number
): RegistryEntry {
  const merged: RegistryEntry = {
    ...incoming,
    first_seen_version: carried.first_seen_version,
    last_seen_version: nextVersion,
    last_generated_at: carried.last_generated_at,
    generation_history: carried.generation_history ?? [carried.first_seen_version]
  };
  // Preserve the frozen locator name across tagger runs — incoming entries
  // from the scanner don't carry it, but once gen-locators has written it
  // into the registry it must survive every subsequent carry-over.
  if (carried.locator_name !== undefined) {
    merged.locator_name = carried.locator_name;
  }
  // Preserve the disambiguator the previous run assigned, unless the new run
  // recomputed one (which it does whenever a collision actually had to be
  // resolved this round).
  if (incoming.disambiguator === undefined && carried.disambiguator !== undefined) {
    merged.disambiguator = carried.disambiguator;
  }
  return merged;
}

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
