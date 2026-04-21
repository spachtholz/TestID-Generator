// Registry schema types (FR-2.1). Also exported as JSON schema in ./json-schema.ts.

export interface SemanticAttributes {
  formcontrolname: string | null;
  name?: string | null;
  routerlink?: string | null;
  aria_label: string | null;
  placeholder: string | null;
  /** visible text, no interpolations */
  text_content: string | null;
  type: string | null;
  role?: string | null;
  // passthrough for future semantic attributes
  [key: string]: string | null | undefined;
}

export interface DynamicChildren {
  /** CSS selector pattern addressing dynamically-rendered children */
  pattern: string;
  addressing: DynamicAddressing[];
}

export type DynamicAddressing = 'by_index' | 'by_text' | 'by_value' | 'by_date';

export type EntrySource = 'generated' | 'manual';

export interface RegistryEntry {
  component: string;
  tag: string;
  /** `primeng_dropdown`, `native_input`, `material_select`, ... */
  element_type: string;
  fingerprint: string;
  semantic: SemanticAttributes;
  dynamic_children?: DynamicChildren | null;
  /** `generated` = tagger inserted, `manual` = human wrote it. Loader backfills legacy. */
  source?: EntrySource;
  first_seen_version: number;
  last_seen_version: number;
  /** ISO-8601; set on fresh generation or regeneration, not on carry-overs */
  last_generated_at?: string;
  /** versions in which this id was (re-)generated */
  generation_history?: number[];
}

export interface Registry {
  $schema: string;
  version: number;
  generated_at: string;
  build_id: string | null;
  app_version: string | null;
  framework_versions: Record<string, string>;
  entries: Record<string, RegistryEntry>;
}

export function createEmptyRegistry(version: number, generatedAt: string): Registry {
  return {
    $schema: './testid-registry.schema.json',
    version,
    generated_at: generatedAt,
    build_id: null,
    app_version: null,
    framework_versions: {},
    entries: {}
  };
}
