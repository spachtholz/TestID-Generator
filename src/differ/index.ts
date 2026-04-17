/** Public library entry for @testid/differ. */

export {
  diffRegistries,
  exitCodeForDiff,
  DEFAULT_CONFIDENCE_THRESHOLD
} from './diff-algorithm.js';
export type {
  DiffResult,
  DiffSummary,
  DiffOptions,
  DiffCategory,
  UnchangedEntry,
  ModifiedEntry,
  RenamedEntry,
  SimpleEntry
} from './diff-algorithm.js';

export { renderDiffMarkdown, renderDiffJson } from './report-generator.js';

export {
  levenshtein,
  similarityScore,
  serializeSemantics,
  entrySimilarity
} from './similarity.js';
