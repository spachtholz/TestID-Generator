// Pre-run backups consumed by `testid rollback`. Backup layout mirrors the
// source path relative to cwd so the tree stays portable across checkouts.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface BackupManifestEntry {
  /** absolute destination path at backup time */
  original: string;
  /** path inside the backup folder */
  backup: string;
}

export interface BackupManifest {
  version: number;
  generatedAt: string;
  cwd: string;
  entries: BackupManifestEntry[];
}

export interface WriteBackupOptions {
  registryDir: string;
  version: number;
  cwd: string;
  generatedAt: string;
  /** absolute paths of templates about to be overwritten */
  sources: readonly string[];
}

export interface WriteBackupResult {
  backupDir: string;
  manifestPath: string;
  entries: BackupManifestEntry[];
}

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

// fallback for sources outside cwd (rare). Drive letter -> `X_drive`, rest fwd-slashed.
function sanitizeAbsolute(absolutePath: string): string {
  return absolutePath
    .replace(/^([A-Za-z]):/, '$1_drive')
    .replace(/^\//, '')
    .replace(/\\/g, '/');
}
