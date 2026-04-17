/**
 * Versioned registry writer (FR-2.2, FR-2.3, FR-2.4, FR-1.9, NFR-3).
 *
 * Writes `testids.v{N}.json` + `testids.latest.json` to the configured
 * artifact directory. Version counter is derived from the highest existing
 * `v{N}` file in the target directory (so parallel builds on clean working
 * copies pick up from where the last release left off).
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { canonicalizeJson } from '../util/canonical-json.js';
import type { Registry, RegistryEntry } from './schema.js';

export interface WriteResult {
  versionedPath: string;
  latestPath: string;
  version: number;
}

const VERSIONED_FILE_PATTERN = /^testids\.v(\d+)\.json$/;
const LATEST_FILE_NAME = 'testids.latest.json';

/**
 * Scan `dir` for files named `testids.v{N}.json` and return the highest N.
 * Returns 0 if no versioned files are present (so the caller writes v1 first).
 */
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

/**
 * Serialise a registry to a canonical, deterministic JSON string (NFR-3).
 * Keys are sorted alphabetically at every level so two equal registries always
 * produce byte-identical output, which CI pipelines rely on for change detection.
 */
export function serializeRegistry(registry: Registry): string {
  return JSON.stringify(canonicalizeJson(registry), null, 2) + '\n';
}

export interface WriteRegistryOptions {
  /** Directory to write into (will be created if missing). */
  dir: string;
  /**
   * If provided, use this as the registry version; otherwise highestExisting + 1.
   * Useful when re-writing a registry in place.
   */
  version?: number;
  /**
   * When > 0, delete all but the newest N `testids.vX.json` files after the
   * new version is written. `testids.latest.json` is never touched by this
   * policy. A value of 0 (default) keeps every version — backwards compatible.
   */
  retention?: number;
}

/**
 * Write a registry to `dir` using the next available version number.
 * The input registry's `version` field is overwritten with the chosen version.
 *
 * Also writes `testids.latest.json` as a byte-for-byte copy (we avoid symlinks
 * so the file works on Windows and in tarball artifacts).
 */
export async function writeRegistry(
  registry: Registry,
  options: WriteRegistryOptions
): Promise<WriteResult> {
  const { dir } = options;
  await fs.mkdir(dir, { recursive: true });

  const version =
    options.version ?? (await findHighestExistingVersion(dir)) + 1;

  const finalRegistry: Registry = { ...registry, version };
  const serialized = serializeRegistry(finalRegistry);

  const versionedPath = path.join(dir, `testids.v${version}.json`);
  const latestPath = path.join(dir, LATEST_FILE_NAME);

  await fs.writeFile(versionedPath, serialized, 'utf8');
  await fs.writeFile(latestPath, serialized, 'utf8');

  if (options.retention && options.retention > 0) {
    await pruneOldVersions(dir, options.retention);
  }

  return { versionedPath, latestPath, version };
}

/**
 * Keep only the newest `keep` versioned files in `dir`; delete the rest.
 * Never touches `testids.latest.json` or any file that doesn't match the
 * versioned pattern. Errors are swallowed silently: retention is a best-
 * effort cleanup, not a correctness guarantee.
 */
async function pruneOldVersions(dir: string, keep: number): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }

  const versioned: { name: string; version: number }[] = [];
  for (const name of entries) {
    const match = VERSIONED_FILE_PATTERN.exec(name);
    if (match && match[1]) {
      const v = Number.parseInt(match[1], 10);
      if (Number.isFinite(v)) versioned.push({ name, version: v });
    }
  }
  if (versioned.length <= keep) return;

  versioned.sort((a, b) => b.version - a.version);
  const toDelete = versioned.slice(keep);
  await Promise.all(
    toDelete.map((entry) =>
      fs.unlink(path.join(dir, entry.name)).catch(() => undefined)
    )
  );
}

/**
 * Simple-path merge for callers that do not care about long-term history.
 * Preserves `first_seen_version` from the previous latest registry and bumps
 * `last_seen_version`. For regeneration-aware merging that records
 * `last_generated_at` and `generation_history`, use `mergeEntriesWithHistory`
 * from `./merge.js` instead.
 */
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

/**
 * Find entries whose source flipped from `generated` → `manual` between the
 * previous registry and the newly-merged one — i.e. a developer hand-pinned a
 * testid the tagger used to manage. These events surface as actionable stderr
 * warnings; the inverse direction (`manual` → `generated`) is intentionally
 * ignored because it represents the tagger reclaiming an id the user dropped,
 * which is not something a test author needs to act on.
 */
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
