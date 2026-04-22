/** Public library entry for @testid/tagger. */

export { runTagger, tagTemplateSource } from './tagger.js';
export type {
  TaggerRunOptions,
  TaggerRunResult,
  TagTemplateOptions,
  TagTemplateResult
} from './tagger.js';

export {
  generateFingerprint,
  snapshotSemantics
} from './fingerprint-generator.js';
export type { Fingerprint, SemanticSnapshot, SemanticKey } from './fingerprint-generator.js';

export {
  generateId,
  kebab,
  componentNameFromPath,
  hashFingerprint
} from './id-generator.js';
export type { GenerateIdInput } from './id-generator.js';

export {
  detectElement,
  getDynamicChildrenSpec
} from './element-detector.js';
export type {
  DetectedElement,
  ElementTypeShort,
  ElementTypeLong,
  DynamicChildrenPatternSpec
} from './element-detector.js';

export { loadConfig, DEFAULT_CONFIG, TaggerConfigSchema } from './config-loader.js';
export type { TaggerConfig } from './config-loader.js';

export {
  parseAngularTemplate,
  walkElements,
  findAttribute,
  getTagName,
  getStaticTextContent
} from './template-parser.js';
export type { ParsedTemplate, ParseOptions, VisitedElement, LoopContext } from './template-parser.js';

export { formatLoopWarnings } from './loop-warner.js';
export type { LoopWarning } from './loop-warner.js';
