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
    /** placeholders: {component}, {element}, {key}, {tag}, {hash} */
    variableFormat: z.string().min(1).default('{component}_{element}_{key}'),
    /** falls back to tagger.attributeName */
    attributeName: z.string().optional(),
    xpathPrefix: z.string().default('xpath:'),
    /** merge keeps manual lines, overwrite rewrites, refuse errors on existing */
    mode: z.enum(['merge', 'overwrite', 'refuse']).default('merge'),
    /** @deprecated use `mode` */
    overwrite: z.boolean().optional()
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
