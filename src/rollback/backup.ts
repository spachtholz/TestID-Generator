/**
 * Pre-run template backups used by `testid rollback`.
 *
 * The tagger writes each template it is about to rewrite into a
 * `{registryDir}/backup.v{N}/` folder, side-by-side with a
 * `manifest.json` that records the absolute source path. A later
 * `testid rollback` reads the manifest of the newest `backup.v{N}/`,
 * copies each file back to its original location, and drops the
 * associated registry version.
 *
 * Backups mirror the relative path of the source file inside
 * `backup.v{N}/`, not the absolute one — that keeps the backup tree
 * portable across checkouts even though the manifest pins absolute
 * destinations for restoration.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface BackupManifestEntry {
  /** Absolute destination path at the time of the backup. */
  original: string;
  /** Path inside the backup folder, relative to it. */
  backup: string;
}

export interface BackupManifest {
  version: number;
  generatedAt: string;
  cwd: string;
  entries: BackupManifestEntry[];
}

export interface WriteBackupOptions {
  /** Root registry directory; `backup.v{N}/` is written directly beneath it. */
  registryDir: string;
  version: number;
  cwd: string;
  generatedAt: string;
  /**
   * Absolute paths of every template the tagger is about to overwrite. Already
   * un-modified files should not be passed in — they are not worth backing up.
   */
  sources: readonly string[];
}

export interface WriteBackupResult {
  backupDir: string;
  manifestPath: string;
  entries: BackupManifestEntry[];
}

/**
 * Copy every source into the backup tree and persist the manifest.
 *
 * The entry-level `backup` path is the source file path relative to `cwd` if
 * the source lives underneath it; otherwise we fall back to the absolute path
 * with path separators sanitized. The fallback covers edge cases — normally
 * every Angular template is inside the project root.
 */
export async function writeBackup(
  options: WriteBackupOptions
): Promise<WriteBackupResult> {
  const backupDir = path.join(options.registryDir, `backup.v${options.version}`);
  await fs.mkdir(backupDir, { recursive: true });

  const entries: BackupManifestEntry[] = [];
  for (const source of options.sources) {
    const relative = backupRelativePath(source, options.cwd);
    const destination = path.join(backupDir, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    entries.push({ original: source, backup: relative });
  }

  entries.sort((a, b) => a.backup.localeCompare(b.backup));
  const manifest: BackupManifest = {
    version: options.version,
    generatedAt: options.generatedAt,
    cwd: options.cwd,
    entries
  };
  const manifestPath = path.join(backupDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return { backupDir, manifestPath, entries };
}

function backupRelativePath(source: string, cwd: string): string {
  const rel = path.relative(cwd, source);
  const insideCwd = rel && !rel.startsWith('..') && !path.isAbsolute(rel);
  if (insideCwd) return rel.replace(/\\/g, '/');
  return sanitizeAbsolute(source);
}

/**
 * Produce a filesystem-safe representation of an absolute path we can put
 * inside `backup.v{N}/`. Drive letters keep their colon but the rest of the
 * path is converted to forward slashes and any prefix colon is dropped.
 */
function sanitizeAbsolute(absolutePath: string): string {
  return absolutePath
    .replace(/^([A-Za-z]):/, '$1_drive')
    .replace(/^\//, '')
    .replace(/\\/g, '/');
}
