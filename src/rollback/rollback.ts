// Undo the last tagger run by replaying the newest backup.v{N}/manifest.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { BackupManifest } from './backup.js';

const VERSIONED_BACKUP_PATTERN = /^backup\.v(\d+)$/;
const VERSIONED_REGISTRY_PATTERN = /^testids\.v(\d+)\.json$/;

export interface RollbackOptions {
  registryDir: string;
  /** dry run: plan but don't touch disk */
  dryRun?: boolean;
}

export interface RollbackResult {
  /** The version that was rolled back. `null` when no backup existed. */
  rolledBackVersion: number | null;
  /** The version now recorded in `testids.latest.json`, or `null` if deleted. */
  restoredToVersion: number | null;
  /** Absolute paths of every template restored to its original location. */
  restoredFiles: string[];
  /** Paths that were planned to restore but failed (source missing / permission). */
  failedFiles: string[];
  dryRun: boolean;
}

export async function rollbackLatestRun(
  options: RollbackOptions
): Promise<RollbackResult> {
  const dryRun = options.dryRun ?? false;
  const backup = await findLatestBackup(options.registryDir);
  if (!backup) {
    return emptyResult(dryRun);
  }

  const manifest = await readManifest(backup.manifestPath);
  const restoredFiles: string[] = [];
  const failedFiles: string[] = [];

  for (const entry of manifest.entries) {
    const source = path.join(backup.dir, entry.backup);
    const nativeOriginal = path.normalize(entry.original);
    try {
      if (!dryRun) {
        await fs.mkdir(path.dirname(nativeOriginal), { recursive: true });
        await fs.copyFile(source, nativeOriginal);
      }
      restoredFiles.push(nativeOriginal);
    } catch {
      failedFiles.push(nativeOriginal);
    }
  }

  if (!dryRun) {
    await removeRegistryVersion(options.registryDir, backup.version);
    await updateLatestPointer(options.registryDir, backup.version);
    await fs.rm(backup.dir, { recursive: true, force: true });
  }

  return {
    rolledBackVersion: backup.version,
    restoredToVersion: await previousVersion(options.registryDir, backup.version, dryRun),
    restoredFiles,
    failedFiles,
    dryRun
  };
}

interface BackupLocation {
  version: number;
  dir: string;
  manifestPath: string;
}

async function findLatestBackup(registryDir: string): Promise<BackupLocation | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(registryDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  let newest: BackupLocation | null = null;
  for (const name of entries) {
    const match = VERSIONED_BACKUP_PATTERN.exec(name);
    if (!match?.[1]) continue;
    const version = Number.parseInt(match[1], 10);
    if (!Number.isFinite(version)) continue;
    const dir = path.join(registryDir, name);
    const manifestPath = path.join(dir, 'manifest.json');
    try {
      await fs.access(manifestPath);
    } catch {
      continue; // malformed backup folder without manifest
    }
    if (!newest || version > newest.version) {
      newest = { version, dir, manifestPath };
    }
  }
  return newest;
}

async function readManifest(manifestPath: string): Promise<BackupManifest> {
  const raw = await fs.readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as BackupManifest;
}

async function removeRegistryVersion(registryDir: string, version: number): Promise<void> {
  const target = path.join(registryDir, `testids.v${version}.json`);
  try {
    await fs.unlink(target);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

async function updateLatestPointer(registryDir: string, removedVersion: number): Promise<void> {
  const previous = await previousVersion(registryDir, removedVersion, false);
  const latestPath = path.join(registryDir, 'testids.latest.json');
  if (previous === null) {
    try {
      await fs.unlink(latestPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    return;
  }
  const previousPath = path.join(registryDir, `testids.v${previous}.json`);
  await fs.copyFile(previousPath, latestPath);
}

async function previousVersion(
  registryDir: string,
  removedVersion: number,
  dryRun: boolean
): Promise<number | null> {
  let entries: string[];
  try {
    entries = await fs.readdir(registryDir);
  } catch {
    return null;
  }
  let best: number | null = null;
  for (const name of entries) {
    const match = VERSIONED_REGISTRY_PATTERN.exec(name);
    if (!match?.[1]) continue;
    const version = Number.parseInt(match[1], 10);
    if (!Number.isFinite(version)) continue;
    // During a real rollback the current version's file is deleted before we
    // look - but in dry-run mode it still exists, so exclude it explicitly.
    if (dryRun && version === removedVersion) continue;
    if (version < removedVersion && (best === null || version > best)) {
      best = version;
    }
  }
  return best;
}

function emptyResult(dryRun: boolean): RollbackResult {
  return {
    rolledBackVersion: null,
    restoredToVersion: null,
    restoredFiles: [],
    failedFiles: [],
    dryRun
  };
}
