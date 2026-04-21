// Scans every testids.vN.json in the registry dir and folds them into
// a per-id history summary used by the merge step to distinguish new vs
// regenerated ids.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Registry } from './schema.js';
import { parseRegistry } from './loader.js';

const VERSIONED_FILE_PATTERN = /^testids\.v(\d+)\.json$/;

export interface IdHistoryRecord {
  first_seen_version: number;
  latest_recorded_version: number;
  /** versions where the id (re-)appeared after absence */
  generation_history: number[];
}

export type HistoryMap = Map<string, IdHistoryRecord>;

export async function loadFullHistory(dir: string): Promise<HistoryMap> {
  const files = await listVersionedFiles(dir);
  if (files.length === 0) return new Map();

  files.sort((a, b) => a.version - b.version);
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

function summarize(versions: number[]): IdHistoryRecord {
  versions.sort((a, b) => a - b);
  const generation_history: number[] = [versions[0]!];
  for (let i = 1; i < versions.length; i++) {
    // gap in versions = id was missing in between = regeneration event
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
    // corrupt history file shouldn't block a run; worst case = regen looks new
    return null;
  }
}
