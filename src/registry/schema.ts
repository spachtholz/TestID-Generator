/**
 * Registry schema type definitions (FR-2.1).
 *
 * These types mirror the JSON shape described in the project requirements
 * exactly. The same shape is also exported as a JSON Schema object from
 * `./json-schema.ts` for runtime validation.
 */

export interface SemanticAttributes {
  /** Angular Reactive Forms form control name (highest priority fingerprint). */
  formcontrolname: string | null;
  /** Native `name` attribute. */
  name?: string | null;
  /** RouterLink destination. */
  routerlink?: string | null;
  /** `aria-label` attribute. */
  aria_label: string | null;
  /** Placeholder attribute. */
  placeholder: string | null;
  /** Static text content (no interpolations). */
  text_content: string | null;
  /** HTML `type` attribute (input / button). */
  type: string | null;
  /** `role` attribute. */
  role?: string | null;
  /** Additional passthrough attributes (reserved for future use). */
  [key: string]: string | null | undefined;
}

export interface DynamicChildren {
  /**
   * A CSS selector pattern that, combined with the host test id, addresses
   * the dynamically rendered children (overlay rows, datepicker cells, ...).
   */
  pattern: string;
  /** Which addressing strategies are supported for the children. */
  addressing: DynamicAddressing[];
}

export type DynamicAddressing = 'by_index' | 'by_text' | 'by_value' | 'by_date';

export type EntrySource = 'generated' | 'manual';

export interface RegistryEntry {
  /** Relative path (from project root) to the component template. */
  component: string;
  /** The original tag name, e.g. `p-dropdown` or `input`. */
  tag: string;
  /**
   * Categorized element type used to group taggable elements
   * (e.g. `primeng_dropdown`, `native_input`, `material_select`).
   */
  element_type: string;
  /** Deterministic fingerprint string used for matching (FR-1.6). */
  fingerprint: string;
  /** Raw semantic attributes extracted from the element. */
  semantic: SemanticAttributes;
  /** Optional dynamic-children pattern (FR-1.8). */
  dynamic_children?: DynamicChildren | null;
  /**
   * How this testid came to be: `generated` means the tagger inserted it,
   * `manual` means a human had already written a `data-testid` on the element.
   * Optional for forward compatibility with legacy registries — loader
   * backfills missing values as `generated`.
   */
  source?: EntrySource;
  /** Registry version in which the entry first appeared. */
  first_seen_version: number;
  /** Most recent registry version in which the entry was seen. */
  last_seen_version: number;
  /**
   * ISO-8601 timestamp recorded the last time this entry was *(re-)established*
   * by the tagger — either on first creation or after it had been removed and
   * came back. Carry-overs do not update this field; only fresh generations do.
   * Optional for forward compatibility with pre-v0.1.2 registries.
   */
  last_generated_at?: string;
  /**
   * Ordered list of registry versions in which this entry was (re-)generated.
   * A single-element list means the entry has existed continuously since its
   * first appearance. A multi-element list means it was removed and reappeared
   * at least once — each entry marks a regeneration event. Optional for
   * forward compatibility with pre-v0.1.2 registries; loader backfills it
   * with `[first_seen_version]`.
   */
  generation_history?: number[];
}

export interface Registry {
  $schema: string;
  /** Monotonically increasing registry version (FR-2.2). */
  version: number;
  /** ISO-8601 generation timestamp. */
  generated_at: string;
  /** Optional build identifier (CI build number, release tag, ...). */
  build_id: string | null;
  /** Optional application version. */
  app_version: string | null;
  /** Framework-library versions (Angular, PrimeNG, Material, ...). */
  framework_versions: Record<string, string>;
  /** Map of data-testid to its registry entry. */
  entries: Record<string, RegistryEntry>;
}

/** Create an empty registry with sensible defaults. */
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
