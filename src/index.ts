/**
 * Public library entry for `@testid/automation`.
 *
 * Re-exports every programmatic API from the three sub-modules so external
 * consumers can `import { runTagger, diffRegistries, ... } from '@testid/automation'`
 * without needing to know the internal folder layout.
 *
 * If you only need the CLI, you don't need this file — the `bin` entries in
 * package.json (`testid-tagger`, `testid-differ`) are the intended UX for
 * most users.
 */

export { VERSION } from './version.js';

// Tagger
export {
  runTagger,
  tagTemplateSource,
  generateFingerprint,
  snapshotSemantics,
  generateId,
  kebab,
  componentNameFromPath,
  hashFingerprint,
  detectElement,
  getDynamicChildrenSpec,
  loadConfig,
  DEFAULT_CONFIG,
  TaggerConfigSchema,
  parseAngularTemplate,
  walkElements,
  findAttribute,
  getTagName,
  getStaticTextContent
} from './tagger/index.js';

export type {
  TaggerRunOptions,
  TaggerRunResult,
  TagTemplateOptions,
  TagTemplateResult,
  Fingerprint,
  SemanticSnapshot,
  SemanticKey,
  GenerateIdInput,
  DetectedElement,
  ElementTypeShort,
  ElementTypeLong,
  DynamicChildrenPatternSpec,
  TaggerConfig,
  ParsedTemplate,
  ParseOptions,
  VisitedElement
} from './tagger/index.js';

// Registry
export {
  createEmptyRegistry,
  writeRegistry,
  serializeRegistry,
  findHighestExistingVersion,
  mergeWithPrevious,
  loadRegistry,
  loadLatestRegistry,
  parseRegistry,
  RegistryValidationError,
  registryJsonSchema
} from './registry/index.js';

export type {
  Registry,
  RegistryEntry,
  SemanticAttributes,
  DynamicChildren,
  DynamicAddressing,
  WriteRegistryOptions,
  WriteResult
} from './registry/index.js';

// Differ
export {
  diffRegistries,
  exitCodeForDiff,
  DEFAULT_CONFIDENCE_THRESHOLD,
  renderDiffMarkdown,
  renderDiffJson,
  levenshtein,
  similarityScore,
  serializeSemantics,
  entrySimilarity
} from './differ/index.js';

export type {
  DiffResult,
  DiffSummary,
  DiffOptions,
  DiffCategory,
  UnchangedEntry,
  ModifiedEntry,
  RenamedEntry,
  SimpleEntry
} from './differ/index.js';

// Robot Framework locator generator
export { generateLocators, renderLocatorModule, filenameForComponent } from './locators/index.js';
export type {
  GenerateLocatorsOptions,
  GenerateLocatorsResult,
  LocatorEntry,
  LocatorModule
} from './locators/index.js';

// Rollback
export { writeBackup, rollbackLatestRun } from './rollback/index.js';
export type {
  BackupManifest,
  BackupManifestEntry,
  WriteBackupOptions,
  WriteBackupResult,
  RollbackOptions,
  RollbackResult
} from './rollback/index.js';
