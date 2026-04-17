/**
 * Long-term history scanner.
 *
 * The tagger needs to know whether an id it's about to assign has ever existed
 * before — not just in the most recent `testids.latest.json`, but anywhere in
 * the retention window. This module reads every `testids.vN.json` file in the
 * registry directory and folds them into a per-id summary:
 *
 *   - `first_seen_version` — earliest version the id appeared in
 *   - `latest_recorded_version` — most recent version the id appeared in
 *   - `generation_history` — versions at which the id was (re-)established
 *
 * That summary is the input the merge step uses to distinguish a regeneration
 * (id existed in an older version, then disappeared, now back) from a truly
 * new id (never seen before in any version).
 */
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Registry } from './schema.js';
import { parseRegistry } from './loader.js';

const VERSIONED_FILE_PATTERN = /^testids\.v(\d+)\.json$/;

export interface IdHistoryRecord {
  first_seen_version: number;
  latest_recorded_version: number;
  /**
   * Versions in ascending order where the id was (re-)established — i.e. it
   * was present in version N but absent in N-1 (or this is version 1).
   */
  generation_history: number[];
}

/** Aggregate of every id ever written to this registry directory. */
export type HistoryMap = Map<string, IdHistoryRecord>;

/**
 * Scan a registry directory for all versioned files and return a per-id
 * history summary. Returns an empty map if the directory does not exist.
 */
export async function loadFullHistory(dir: string): Promise<HistoryMap> {
  const files = await listVersionedFiles(dir);
  if (files.length === 0) return new Map();

  // Sort ascending by version so we can detect gaps chronologically after the
  // parallel reads land.
  files.sort((a, b) => a.version - b.version);

  // Read every versioned file concurrently — they are independent, and
  // sequential awaiting here would dominate tagger wall time on projects
  // that keep a long retention window.
  const registries = await Promise.all(files.map((f) => readRegistryFile(f.path)));

  // `presence[id]` = sorted list of versions the id appeared in.
  const presence = new Map<string, number[]>();
  for (let i = 0; i < files.length; i++) {
    const registry = registries[i];
    if (!registry) continue;
    const version = files[i]!.version;
    for (const id of Object.keys(registry.entries)) {
      const list = presence.get(id) ?? [];
      list.push(version);
      presence.set(id, list);
    }
  }

  const map: HistoryMap = new Map();
  for (const [id, versions] of presence) {
    map.set(id, summarize(versions));
  }
  return map;
}

/**
 * Given every version an id was seen in, infer the generation_history
 * (versions at which it (re-)appeared after absence).
 */
function summarize(versions: number[]): IdHistoryRecord {
  versions.sort((a, b) => a - b);
  const generation_history: number[] = [versions[0]!];
  for (let i = 1; i < versions.length; i++) {
    // A gap in the version sequence means the id was missing in between —
    // its reappearance counts as a regeneration event.
    if (versions[i]! !== versions[i - 1]! + 1) {
      generation_history.push(versions[i]!);
    }
  }
  return {
    first_seen_version: versions[0]!,
    latest_recorded_version: versions[versions.length - 1]!,
    generation_history
  };
}

async function listVersionedFiles(dir: string): Promise<{ path: string; version: number }[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: { path: string; version: number }[] = [];
  for (const name of entries) {
    const match = VERSIONED_FILE_PATTERN.exec(name);
    if (!match?.[1]) continue;
    const version = Number.parseInt(match[1], 10);
    if (Number.isFinite(version)) out.push({ path: path.join(dir, name), version });
  }
  return out;
}

async function readRegistryFile(filePath: string): Promise<Registry | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseRegistry(raw);
  } catch {
    // A corrupt or unreadable history file should not block a new tagger run.
    // The worst-case outcome is that we misclassify a regeneration as a brand-
    // new id, which is safer than refusing to write a new registry.
    return null;
  }
}
