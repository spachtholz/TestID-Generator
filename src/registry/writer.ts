// Versioned registry writer (FR-2.2 / 2.3 / 2.4).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { canonicalizeJson } from '../util/canonical-json.js';
import {
  applyRegistryProfile,
  type ResolvedRegistryOptions
} from './serialization.js';
import type { Registry, RegistryEntry } from './schema.js';

export interface WriteResult {
  versionedPath: string;
  latestPath: string;
  version: number;
}

export type RegistryNaming = 'version' | 'timestamp';

const VERSIONED_FILE_PATTERN = /^testids\.v(\d+)\.json$/;
const TIMESTAMPED_FILE_PATTERN = /^testids\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d+)?Z?)\.json$/;
const LATEST_FILE_NAME = 'testids.latest.json';

export function isVersionedRegistryFile(name: string): boolean {
  return VERSIONED_FILE_PATTERN.test(name) || TIMESTAMPED_FILE_PATTERN.test(name);
}

/** ISO 8601 with colons and dots replaced so the string is safe as a filename. */
export function isoToFileSafe(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

function fileNameFor(
  naming: RegistryNaming,
  version: number,
  generatedAt: string
): string {
  if (naming === 'timestamp') {
    return `testids.${isoToFileSafe(generatedAt)}.json`;
  }
  return `testids.v${version}.json`;
}

/** Highest N in `testids.v{N}.json` under `dir`, or 0 if none. */
export async function findHighestExistingVersion(dir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return 0;
    }
    throw err;
  }

  let highest = 0;
  for (const name of entries) {
    const match = VERSIONED_FILE_PATTERN.exec(name);
    if (match && match[1]) {
      const v = Number.parseInt(match[1], 10);
      if (Number.isFinite(v) && v > highest) {
        highest = v;
      }
    }
  }
  return highest;
}

/** Canonical JSON (keys sorted at every level) so equal registries are byte-equal. */
export function serializeRegistry(
  registry: Registry,
  serializationOptions?: ResolvedRegistryOptions
): string {
  const projected = serializationOptions
    ? applyRegistryProfile(registry, serializationOptions)
    : registry;
  return JSON.stringify(canonicalizeJson(projected), null, 2) + '\n';
}

export interface WriteRegistryOptions {
  dir: string;
  /** override auto-increment */
  version?: number;
  /** keep only newest N versioned files; 0 = keep all */
  retention?: number;
  serializationOptions?: ResolvedRegistryOptions;
  /** how to name the versioned snapshot file. Defaults to 'version'. */
  naming?: RegistryNaming;
}

export async function writeRegistry(
  registry: Registry,
  options: WriteRegistryOptions
): Promise<WriteResult> {
  const { dir } = options;
  const naming: RegistryNaming = options.naming ?? 'version';
  await fs.mkdir(dir, { recursive: true });

  const version =
    options.version ?? (await findHighestExistingVersion(dir)) + 1;

  const finalRegistry: Registry = { ...registry, version };
  const serialized = serializeRegistry(finalRegistry, options.serializationOptions);

  const versionedPath = path.join(dir, fileNameFor(naming, version, finalRegistry.generated_at));
  const latestPath = path.join(dir, LATEST_FILE_NAME);

  await fs.writeFile(versionedPath, serialized, 'utf8');
  await fs.writeFile(latestPath, serialized, 'utf8');

  if (options.retention && options.retention > 0) {
    await pruneOldVersions(dir, options.retention);
  }

  return { versionedPath, latestPath, version };
}

async function pruneOldVersions(dir: string, keep: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  // Treat both naming schemes as one pool ordered by internal version so a
  // project that switched schemes mid-lifetime prunes cleanly.
  const snapshots: { name: string; version: number }[] = [];
  for (const name of entries) {
    const vMatch = VERSIONED_FILE_PATTERN.exec(name);
    if (vMatch && vMatch[1]) {
      const v = Number.parseInt(vMatch[1], 10);
      if (Number.isFinite(v)) snapshots.push({ name, version: v });
      continue;
    }
    if (TIMESTAMPED_FILE_PATTERN.test(name)) {
      try {
        const raw = await fs.readFile(path.join(dir, name), 'utf8');
        const parsed = JSON.parse(raw) as { version?: number };
        if (typeof parsed.version === 'number' && Number.isFinite(parsed.version)) {
          snapshots.push({ name, version: parsed.version });
        }
      } catch {
        // skip unreadable/corrupt snapshot
      }
    }
  }
  if (snapshots.length <= keep) return;

  snapshots.sort((a, b) => b.version - a.version);
  const toDelete = snapshots.slice(keep);
  await Promise.all(
    toDelete.map((entry) =>
      fs.unlink(path.join(dir, entry.name)).catch(() => undefined)
    )
  );
}

/** Simple merge. For history-aware merges, use mergeEntriesWithHistory. */
export function mergeWithPrevious(
  previous: Registry | null,
  newEntries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>>,
  nextVersion: number
): Record<string, RegistryEntry> {
  const merged: Record<string, RegistryEntry> = {};
  for (const [id, entry] of Object.entries(newEntries)) {
    const previousEntry = previous?.entries?.[id];
    merged[id] = {
      ...entry,
      first_seen_version: previousEntry?.first_seen_version ?? nextVersion,
      last_seen_version: nextVersion
    };
  }
  return merged;
}

export interface ManualOverrideEvent {
  id: string;
  component: string;
  previousVersion: number;
}

/** Detect `generated` → `manual` flips; the reverse is not interesting. */
export function detectManualOverrideEvents(
  previous: Registry | null,
  merged: Record<string, RegistryEntry>
): ManualOverrideEvent[] {
  if (!previous) return [];
  const events: ManualOverrideEvent[] = [];
  for (const [id, entry] of Object.entries(merged)) {
    const prev = previous.entries[id];
    if (!prev) continue;
    const prevSource = prev.source ?? 'generated';
    if (prevSource === 'generated' && entry.source === 'manual') {
      events.push({ id, component: entry.component, previousVersion: previous.version });
    }
  }
  return events;
}
