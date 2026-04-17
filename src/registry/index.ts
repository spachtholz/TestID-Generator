/** Public entry point for @testid/registry. */

export type {
  Registry,
  RegistryEntry,
  SemanticAttributes,
  DynamicChildren,
  DynamicAddressing,
  EntrySource
} from './schema.js';
export { createEmptyRegistry } from './schema.js';

export {
  writeRegistry,
  serializeRegistry,
  findHighestExistingVersion,
  mergeWithPrevious,
  detectManualOverrideEvents
} from './writer.js';
export type { WriteRegistryOptions, WriteResult, ManualOverrideEvent } from './writer.js';

export { mergeEntriesWithHistory } from './merge.js';
export type { MergeDisposition, MergeOptions, MergedEntryInfo } from './merge.js';

export { loadFullHistory } from './history.js';
export type { HistoryMap, IdHistoryRecord } from './history.js';

export {
  loadRegistry,
  loadLatestRegistry,
  parseRegistry,
  RegistryValidationError
} from './loader.js';

export { registryJsonSchema } from './json-schema.js';
