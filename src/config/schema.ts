/**
 * Unified `testid.config.json` schema.
 *
 * Groups every sub-tool's configuration under top-level sections so a single
 * file covers tagger, differ and locators. Legacy `testid-tagger.config.json`
 * files (raw tagger fields at the root) are still accepted — the loader wraps
 * them into `{ tagger: ... }` before parsing.
 */

import { z } from 'zod';
import { TaggerConfigSchema } from '../tagger/config-loader.js';

export const DifferConfigSchema = z
  .object({
    /** Output formats to emit when `--out-dir` is given. CLI `--format` overrides. */
    outputFormats: z
      .array(z.enum(['md', 'json']))
      .min(1)
      .default(['md', 'json']),
    /** Rename similarity cutoff. Matches with a lower score stay classified as add + remove. */
    threshold: z.number().min(0.1).max(1).default(0.8),
    /** Split `added` into truly-new vs regenerated entries in the report. */
    showRegenerated: z.boolean().default(false)
  })
  .default({});

export const LocatorsConfigSchema = z
  .object({
    /**
     * Template used to render each Python variable name. Same placeholder
     * vocabulary as the tagger's `idFormat`: `{component}`, `{element}`,
     * `{key}`, `{tag}`, `{hash}`. Result is passed through a camelCase
     * Python-identifier sanitiser so dashes/dots never reach the file.
     */
    variableFormat: z.string().min(1).default('{component}_{element}_{key}'),
    /** Override the attribute name used in XPath selectors. Falls back to tagger.attributeName. */
    attributeName: z.string().optional(),
    /** Robot-Framework XPath prefix. Set to '' to emit bare XPaths. */
    xpathPrefix: z.string().default('xpath:'),
    /** Refuse to overwrite existing per-component .py files when false. */
    overwrite: z.boolean().default(true)
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
