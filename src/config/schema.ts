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
    renameThreshold: z.number().min(0.1).max(1).default(0.8)
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
