// Classify each incoming entry as carried-over / regenerated / new based on
// its appearance history, and stamp the corresponding version/time metadata.

import type { Registry, RegistryEntry } from './schema.js';
import type { HistoryMap } from './history.js';

export type MergeDisposition = 'carried-over' | 'regenerated' | 'new';

export interface MergedEntryInfo {
  entry: RegistryEntry;
  disposition: MergeDisposition;
  /** regenerated: version in which the id last existed before this run */
  previousVersion?: number;
}

export interface MergeOptions {
  previous: Registry | null;
  history: HistoryMap;
  newEntries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>>;
  nextVersion: number;
  now: string;
}

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
