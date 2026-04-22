// Tagger config loader (FR-1.4, NFR-6). JSON/MJS/JS/TS all supported.

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { z } from 'zod';

// structural tags, never renders a real element, skip them
export const DEFAULT_IGNORE_TAGS: readonly string[] = [
  'ng-template',
  'ng-container',
  'ng-content',
  'router-outlet',
  'html',
  'head',
  'body',
  'title',
  'meta',
  'link',
  'style',
  'script',
  'base',
  'noscript'
];

export const TaggerConfigSchema = z.object({
  rootDir: z.string().default('src'),
  include: z.array(z.string()).default(['**/*.component.html']),
  ignore: z.array(z.string()).default([]),
  registryDir: z.string().default('test-artifacts/testids'),
  build: z
    .object({
      buildId: z.string().optional(),
      appVersion: z.string().optional(),
      frameworkVersions: z.record(z.string()).optional()
    })
    .default({}),
  /** extra tag denylist, merged with DEFAULT_IGNORE_TAGS */
  ignoreTags: z.array(z.string()).default([]),
  // shortType priority hints - tagging itself is controlled by ignoreTags
  nativeElements: z
    .array(z.string())
    .default(['button', 'input', 'select', 'textarea', 'a', 'form']),
  angularMaterialComponents: z
    .array(z.string())
    .default(['mat-select', 'mat-checkbox', 'mat-radio-button', 'mat-form-field']),
  primengComponents: z
    .array(z.string())
    .default([
      'p-button',
      'p-dropdown',
      'p-select',
      'p-datepicker',
      'p-calendar',
      'p-checkbox',
      'p-radiobutton',
      'p-multiselect',
      'p-autocomplete',
      'p-inputtext',
      'p-dialog',
      'p-listbox',
      'p-table',
      'p-dataview'
    ]),
  testConfigurationOnly: z.boolean().default(true),
  hashLength: z.number().int().min(4).max(16).default(6),
  /** attribute name written into the templates (data-testid, data-cy, ...) */
  attributeName: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/).default('data-testid'),
  hashAlgorithm: z.enum(['sha256', 'sha1', 'md5']).default('sha256'),
  /** hash-suffix = append disambiguator on collision; error = throw */
  collisionStrategy: z.enum(['hash-suffix', 'error']).default('hash-suffix'),
  /** keep only N newest versioned files; 0 = keep all */
  registryRetention: z.number().int().min(0).default(0),
  /** file naming for versioned registry snapshots: 'version' = testids.v{N}.json, 'timestamp' = testids.{iso-no-colons}.json */
  registryNaming: z.enum(['version', 'timestamp']).default('version'),
  /** emit activity.v{N}.md + .json next to the registry */
  writeActivityLog: z.boolean().default(false),
  /** write pre-run backup.v{N}/ so testid rollback can undo */
  writeBackups: z.boolean().default(true),
  /** warn when a static testid is emitted inside a loop context */
  loopWarnings: z.boolean().default(true),
  /**
   * Override the shortType/longType for specific tags.
   * Checked before the built-in native/PrimeNG/Material maps.
   */
  customTagMap: z
    .record(
      z.object({
        shortType: z.string().min(1),
        longType: z.string().min(1)
      })
    )
    .default({}),
  /** placeholders: {component}, {element}, {key}, {tag}, {hash}, {hash:-} */
  idFormat: z.string().min(1).default('{component}__{element}--{key}{hash:-}'),
  /** force {hash} to always render, not just on collisions */
  alwaysHash: z.boolean().default(false),
  // TODO: ontology export profile once feature/owl-export lands back
  registry: z
    .object({
      profile: z.enum(['minimal', 'standard', 'full']).default('full'),
      includeSemantics: z.boolean().optional(),
      includeSource: z.boolean().optional(),
      includeHistory: z.boolean().optional(),
      includeDynamicChildren: z.boolean().optional(),
      semanticFields: z
        .array(
          z.enum([
            'formcontrolname',
            'name',
            'routerlink',
            'aria_label',
            'placeholder',
            'text_content',
            'type',
            'role'
          ])
        )
        .optional()
    })
    .default({})
});

export type TaggerConfig = z.infer<typeof TaggerConfigSchema>;

export const DEFAULT_CONFIG: TaggerConfig = TaggerConfigSchema.parse({});

/**
 * Default config-file names searched (in order) if no `--config` flag was
 * passed. JSON is preferred because it needs no runtime import machinery -
 * a point-of-friction for external Angular projects that don't run their
 * code through ts-node or similar.
 */
export const DEFAULT_CONFIG_FILENAMES: readonly string[] = [
  'testid-tagger.config.json',
  'testid-tagger.config.mjs',
  'testid-tagger.config.js',
  'testid-tagger.config.ts'
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Search for a config file in `searchDir` using {@link DEFAULT_CONFIG_FILENAMES}.
 * Returns the absolute path of the first hit, or null.
 */
export async function findDefaultConfig(searchDir: string): Promise<string | null> {
  for (const name of DEFAULT_CONFIG_FILENAMES) {
    const candidate = path.resolve(searchDir, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

/**
 * Load the tagger-specific slice of the unified config. Backwards-compatible
 * wrapper around the unified loader - takes the `tagger` section and returns
 * it in the pre-0.4.0 shape so existing callers don't have to change.
 *
 * When you also need differ/locator config, call {@link loadTestidConfig}
 * directly and read all three sections yourself.
 */
export async function loadConfig(configPath?: string): Promise<{
  config: TaggerConfig;
  configPath: string | null;
  sourceDir: string;
}> {
  // Lazy import to avoid circular dependency at module-init time (schema.ts
  // imports from this file).
  const { loadTestidConfig } = await import('../config/loader.js');
  const result = await loadTestidConfig(configPath);
  return {
    config: result.config.tagger,
    configPath: result.configPath,
    sourceDir: result.sourceDir
  };
}
