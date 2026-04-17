/**
 * Public library entry for `@testid/automation`.
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
