export { loadLocatorSnapshot, type LocatorSnapshot } from './snapshot.js';
export {
  buildMigrationPlan,
  type MigrationPlan,
  type RenameEntry,
  type OrphanedEntry,
  type Conflict,
  type ConflictKind
} from './plan.js';
export {
  scanRobotProject,
  filterHitsByRenames,
  filterHitsByVariables,
  type ReferenceHit
} from './scanner.js';
export { applyRenames, type ApplyResult } from './applier.js';
export { renderMigrationReport } from './report.js';
