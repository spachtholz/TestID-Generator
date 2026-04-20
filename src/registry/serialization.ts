/**
 * Registry serialization profiles.
 *
 * A config-side layer that decides which *optional* registry fields make it
 * into `testids.v{N}.json`. The schema contract (`registry.schema.ts`) stays
 * the same — we just strip optional keys and null-out semantic sub-fields
 * that the user opted out of.
 *
 * Design principle: profile resolution is pure and isolated. It runs *after*
 * `mergeEntriesWithHistory` has produced a full internal view, so history and
 * merge semantics are never poisoned by the profile — the profile is only an
 * output filter.
 */

import type { Registry, RegistryEntry, SemanticAttributes } from './schema.js';

export type RegistryProfile = 'minimal' | 'standard' | 'full';

export type SemanticFieldName =
  | 'formcontrolname'
  | 'name'
  | 'routerlink'
  | 'aria_label'
  | 'placeholder'
  | 'text_content'
  | 'type'
  | 'role';

export const ALL_SEMANTIC_FIELDS: readonly SemanticFieldName[] = [
  'formcontrolname',
  'name',
  'routerlink',
  'aria_label',
  'placeholder',
  'text_content',
  'type',
  'role'
];

/** User-facing config shape (matches the Zod schema in tagger/config-loader.ts). */
export interface RegistryConfigInput {
  profile?: RegistryProfile;
  includeSemantics?: boolean;
  includeSource?: boolean;
  includeHistory?: boolean;
  includeDynamicChildren?: boolean;
  semanticFields?: SemanticFieldName[];
}

/** Fully-resolved options after merging profile defaults with sibling overrides. */
export interface ResolvedRegistryOptions {
  includeSemantics: boolean;
  includeSource: boolean;
  includeHistory: boolean;
  includeDynamicChildren: boolean;
  semanticFields: readonly SemanticFieldName[];
}

const PROFILE_DEFAULTS: Record<RegistryProfile, ResolvedRegistryOptions> = {
  minimal: {
    includeSemantics: false,
    includeSource: false,
    includeHistory: false,
    includeDynamicChildren: false,
    semanticFields: []
  },
  standard: {
    includeSemantics: true,
    includeSource: true,
    includeHistory: false,
    includeDynamicChildren: true,
    semanticFields: ['formcontrolname', 'aria_label', 'placeholder', 'text_content']
  },
  full: {
    includeSemantics: true,
    includeSource: true,
    includeHistory: true,
    includeDynamicChildren: true,
    semanticFields: ALL_SEMANTIC_FIELDS
  }
};

/**
 * Resolve a user-provided registry config (with optional profile + overrides)
 * into a concrete {@link ResolvedRegistryOptions} the serializer can act on.
 *
 * Rule: profile sets the baseline; any sibling key overrides it. This lets
 * users say "standard profile but include history too" with two keys.
 */
export function resolveRegistryOptions(
  input: RegistryConfigInput | undefined
): ResolvedRegistryOptions {
  const profile = input?.profile ?? 'full';
  const base = PROFILE_DEFAULTS[profile];
  return {
    includeSemantics: input?.includeSemantics ?? base.includeSemantics,
    includeSource: input?.includeSource ?? base.includeSource,
    includeHistory: input?.includeHistory ?? base.includeHistory,
    includeDynamicChildren: input?.includeDynamicChildren ?? base.includeDynamicChildren,
    semanticFields: input?.semanticFields ?? base.semanticFields
  };
}

/**
 * Strip optional registry fields per the resolved profile.
 *
 * Pure function: the input registry is not mutated. When a field group is
 * disabled, the corresponding key is omitted entirely (not nulled) so the
 * JSON stays compact and the loader's "missing = unset" semantics kick in.
 */
export function applyRegistryProfile(
  registry: Registry,
  options: ResolvedRegistryOptions
): Registry {
  const filtered: Record<string, RegistryEntry> = {};
  for (const [id, entry] of Object.entries(registry.entries)) {
    filtered[id] = filterEntry(entry, options);
  }
  return { ...registry, entries: filtered };
}

function filterEntry(
  entry: RegistryEntry,
  options: ResolvedRegistryOptions
): RegistryEntry {
  // Always keep schema-required fields. Semantic is required by the schema,
  // so we emit it as an empty object when includeSemantics is off rather than
  // dropping the key outright — that keeps the registry loadable by older
  // consumers.
  const out: RegistryEntry = {
    component: entry.component,
    tag: entry.tag,
    element_type: entry.element_type,
    fingerprint: entry.fingerprint,
    semantic: options.includeSemantics
      ? filterSemantic(entry.semantic, options.semanticFields)
      : ({} as SemanticAttributes),
    first_seen_version: entry.first_seen_version,
    last_seen_version: entry.last_seen_version
  };

  if (options.includeSource && entry.source !== undefined) {
    out.source = entry.source;
  }
  if (options.includeDynamicChildren && entry.dynamic_children !== undefined) {
    out.dynamic_children = entry.dynamic_children;
  }
  if (options.includeHistory) {
    if (entry.last_generated_at !== undefined) out.last_generated_at = entry.last_generated_at;
    if (entry.generation_history !== undefined) out.generation_history = entry.generation_history;
  }

  return out;
}

function filterSemantic(
  semantic: SemanticAttributes,
  keep: readonly SemanticFieldName[]
): SemanticAttributes {
  const out: SemanticAttributes = {
    formcontrolname: null,
    aria_label: null,
    placeholder: null,
    text_content: null,
    type: null
  };
  for (const key of keep) {
    const value = semantic[key];
    if (value !== undefined) {
      out[key] = value ?? null;
    }
  }
  return out;
}
