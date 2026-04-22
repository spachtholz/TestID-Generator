// Serialization profiles: minimal / standard / full. Applied after merge so
// history data is never lost, only filtered out of the JSON.
// TODO: ontology profile that keeps the fields the owl exporter needs

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

/** Matches the Zod schema in tagger/config-loader.ts. */
export interface RegistryConfigInput {
  profile?: RegistryProfile;
  includeSemantics?: boolean;
  includeSource?: boolean;
  includeHistory?: boolean;
  includeDynamicChildren?: boolean;
  semanticFields?: SemanticFieldName[];
}

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
  // semantic is required by the schema; emit {} when disabled
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
  // locator_name is always preserved when present. It's state that gen-locators
  // has explicitly written in, not profile-gated derived data — dropping it on
  // a `minimal` write would silently unfreeze the locator names on next run.
  if (entry.locator_name !== undefined) {
    out.locator_name = entry.locator_name;
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
