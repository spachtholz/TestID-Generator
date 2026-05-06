// Unified testid.config.json schema. Legacy testid-tagger.config.json files
// are wrapped into `{ tagger: ... }` by the loader before parsing.
// TODO: OntologyConfigSchema once the owl exporter is back in tree

import { z } from 'zod';
import { TaggerConfigSchema } from '../tagger/config-loader.js';

export const DifferConfigSchema = z
  .object({
    outputFormats: z
      .array(z.enum(['md', 'json']))
      .min(1)
      .default(['md', 'json']),
    threshold: z.number().min(0.1).max(1).default(0.8),
    showRegenerated: z.boolean().default(false)
  })
  .default({});

export const LocatorsConfigSchema = z
  .object({
    /** placeholders: {component}, {element}, {key}, {tag}, {hash}, {testid} */
    variableFormat: z.string().min(1).default('{component}_{element}_{key}'),
    /** falls back to tagger.attributeName */
    attributeName: z.string().optional(),
    xpathPrefix: z.string().default('xpath:'),
    /** merge keeps manual lines, overwrite rewrites, refuse errors on existing */
    mode: z.enum(['merge', 'overwrite', 'refuse']).default('merge'),
    /**
     * basename: strip extension only (legacy, silently overwrites on collision)
     * basename-strict: same naming, but error on basename collision
     * disambiguate: prefix with parent path segments when basenames collide
     */
    componentNaming: z
      .enum(['basename', 'basename-strict', 'disambiguate'])
      .default('basename'),
    /** @deprecated use `mode` */
    overwrite: z.boolean().optional(),
    /**
     * Persist each emitted variable name onto its registry entry
     * (`locator_name`). Frozen names are reused verbatim on subsequent runs,
     * so tests keep working even when semantics (aria-label, placeholder,
     * text content) are reworded.
     */
    lockNames: z.boolean().default(false),
    /**
     * One-shot opt-out: recompute every persisted `locator_name` from the
     * current `variableFormat` and overwrite the registry. Use after
     * intentionally changing the template.
     */
    regenerateNames: z.boolean().default(false),
    /**
     * Similarity threshold (0.1..1.0) for rename-aware locator_name carry-over.
     * When the tagger sees a brand-new testid that is highly similar to a
     * removed previous entry holding a locator_name, the name is inherited so
     * Python constants survive semantic edits (aria-label rewordings, etc.).
     * Same algorithm as the differ. Raise toward 1.0 for stricter matching.
     */
    renameThreshold: z.number().min(0.1).max(1).default(0.8),
    /**
     * When true, the managed comment carries the entry's `last_generated_at`
     * date (`# testid-managed | 2026-05-05`). Lets reviewers see at a glance
     * which locators changed semantics in the last tagger run.
     */
    includeGeneratedDate: z.boolean().default(false),
    /**
     * Selector engine for the emitted Python constants:
     *   - `xpath` (default) - `xpath://*[@data-testid='...']`
     *   - `css`             - `css=[data-testid='...']`
     * CSS mode is faster (5-10x in dense DOMs) and works for both
     * SeleniumLibrary and the Browser Library; XPath mode is the legacy
     * default for compatibility with existing suites.
     */
    selectorEngine: z.enum(['xpath', 'css']).default('xpath'),
    /**
     * Prefix for css selectors. Robot's SeleniumLibrary auto-detects via
     * `css=`; pass an empty string when the consumer doesn't need a hint.
     */
    cssPrefix: z.string().default('css='),
    /**
     * Last-resort suffix when no semantic field can split a locator-name
     * collision. `numeric` (default) appends `_2`, `_3`, …; `hash` appends a
     * short fingerprint hash that is stable across runs and independent of
     * sort order - entries keep their suffix even when colliding peers move.
     */
    collisionSuffix: z.enum(['numeric', 'hash']).default('numeric')
  })
  .default({});

export const TestidConfigSchema = z.object({
  tagger: TaggerConfigSchema.default({}),
  differ: DifferConfigSchema,
  locators: LocatorsConfigSchema
});

export type TestidConfig = z.infer<typeof TestidConfigSchema>;
export type DifferConfig = z.infer<typeof DifferConfigSchema>;
export type LocatorsConfig = z.infer<typeof LocatorsConfigSchema>;

export const DEFAULT_TESTID_CONFIG: TestidConfig = TestidConfigSchema.parse({});
