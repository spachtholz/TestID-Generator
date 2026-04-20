/**
 * Loads and validates `testid-tagger.config.ts` (FR-1.4, NFR-6).
 *
 * A config file may use `export default` or a named `config` export. We also
 * accept plain JS/JSON configs as a fallback.
 */

import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { z } from 'zod';

/**
 * Default denylist of tags the tagger leaves untouched.
 *
 * Reasoning: these are either structural directives that never render a real
 * DOM element (`ng-template`, `ng-container`, `ng-content`, `router-outlet`)
 * or belong to `<head>` / document-level metadata (`meta`, `link`, `style`,
 * `script`). Tagging them is either pointless (never assertable) or breaks
 * the page (rewriting `<script>` / `<style>` can corrupt embedded content).
 */
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
  /**
   * Tags the tagger never touches. Extends {@link DEFAULT_IGNORE_TAGS}; the
   * user's list is merged, not replaced.
   */
  ignoreTags: z.array(z.string()).default([]),
  /**
   * Priority hints for element-type (shortType) mapping. These no longer gate
   * tagging — every non-denied tag is tagged. They only influence the
   * short-type slug emitted in the data-testid.
   */
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
  /**
   * Attribute name the tagger writes into templates. Override for Cypress
   * (`data-cy`), custom namespaces, or test frameworks that look for
   * something other than the de-facto `data-testid`.
   */
  attributeName: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_-]*$/).default('data-testid'),
  /**
   * Hash function for the 6-char collision suffix. Only cryptographic
   * properties are irrelevant here — we just need a deterministic,
   * well-distributed digest.
   */
  hashAlgorithm: z.enum(['sha256', 'sha1', 'md5']).default('sha256'),
  /**
   * What happens when two elements in the same component would end up with
   * the same id after the fingerprint is resolved:
   *  - `hash-suffix` (default) — append a hash-derived suffix to the second one.
   *  - `error` — fail the run with a clear report. Useful in strict CI pipelines
   *    where you'd rather reject the change than silently rename.
   */
  collisionStrategy: z.enum(['hash-suffix', 'error']).default('hash-suffix'),
  /**
   * Retention policy for versioned registry files. When set to a positive
   * integer N, the writer keeps only the newest N versioned files plus
   * `testids.latest.json`. When set to 0 (default), every version is kept
   * forever — same behaviour as before this option existed.
   */
  registryRetention: z.number().int().min(0).default(0),
  /**
   * When true, every tagger run writes `activity.v{N}.md` + `activity.v{N}.json`
   * next to the registry — a human-readable audit trail of which ids were
   * freshly created, regenerated after a removal, carried over unchanged or
   * manually pinned. Also written when the CLI's `--verbose` flag is set,
   * regardless of this config value.
   */
  writeActivityLog: z.boolean().default(false),
  /**
   * Before rewriting each template, copy the unchanged original into
   * `{registryDir}/backup.v{N}/` with a `manifest.json`. The companion CLI
   * `testid rollback` uses the backup to restore the previous state when a
   * tagger run turned out to be unwanted. Default: true — the disk footprint
   * is negligible for typical Angular projects and the safety net is worth it.
   */
  writeBackups: z.boolean().default(true),
  /**
   * Map custom component tag names (or any tag) to explicit `shortType` /
   * `longType` values so generated testids read naturally. Checked before the
   * built-in native / PrimeNG / Material maps, so this is also the escape
   * hatch to override any built-in classification.
   *
   * @example
   * "customTagMap": {
   *   "app-user-menu": { "shortType": "menu", "longType": "custom_user_menu" },
   *   "my-chart":      { "shortType": "chart", "longType": "custom_chart" }
   * }
   */
  customTagMap: z
    .record(
      z.object({
        shortType: z.string().min(1),
        longType: z.string().min(1)
      })
    )
    .default({}),
  /**
   * Template string used to render each testid. Placeholders: `{component}`,
   * `{element}`, `{key}`, `{tag}`, `{hash}`, `{hash:-}` (hash with a leading `-`
   * when present). Default: `"{component}__{element}--{key}{hash:-}"` which
   * matches the historical hard-coded shape. Override for Cypress conventions,
   * shorter ids, or custom prefixes like `"tid-{component}-{key}"`.
   */
  idFormat: z.string().min(1).default('{component}__{element}--{key}{hash:-}'),
  /**
   * When true, the fingerprint hash is always computed (and therefore `{hash}`
   * and `{hash:-}` placeholders always render). The default is false: the hash
   * only appears when the tagger needs to disambiguate a collision or when the
   * element has no semantic key, so legacy `idFormat`s stay backwards-compatible.
   *
   * Set this to `true` for hash-only testid shapes like `"tid-{hash}"`, where
   * every id must carry a hash for uniqueness even when the fingerprint already
   * has a nice primary value. `collisionStrategy: "error"` pairs naturally with
   * this mode — short hashes can collide, and you want to know immediately.
   */
  alwaysHash: z.boolean().default(false),
  /**
   * Controls which optional fields are serialized into `testids.v{N}.json`.
   * A `profile` picks a baseline ('minimal' / 'standard' / 'full'), and any
   * sibling boolean overrides win over the profile. `semanticFields` restricts
   * which sub-keys of `semantic` are kept (when `includeSemantics` is on).
   */
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
 * passed. JSON is preferred because it needs no runtime import machinery —
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
 * wrapper around the unified loader — takes the `tagger` section and returns
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
