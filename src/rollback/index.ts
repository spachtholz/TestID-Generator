/** Public entry point for the rollback module. */

export { writeBackup } from './backup.js';
export type { BackupManifest, BackupManifestEntry, WriteBackupOptions, WriteBackupResult } from './backup.js';

export { rollbackLatestRun } from './rollback.js';
export type { RollbackOptions, RollbackResult } from './rollback.js';
