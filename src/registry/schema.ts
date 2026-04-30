// Registry schema types (FR-2.1). Also exported as JSON schema in ./json-schema.ts.

/**
 * Surrounding-context anchors collected by walking up from an element. Used
 * primarily to disambiguate reusable components (`<custom-dropdown>`) when
 * the element itself carries no distinguishing attributes — the wrapping
 * `<label>`, `<legend>`, `<h*>` or wrapper-component `label`-input becomes
 * the semantic key.
 */
export interface ContextAttributes {
  /** Text of a `<label for="thisElementId">` matched via static `id`. */
  label_for: string | null;
  /** `label`/`title`/`header`/`caption` input on a wrapping component. */
  wrapper_label: string | null;
  /** `<legend>` of the nearest enclosing `<fieldset>`. */
  fieldset_legend: string | null;
  /** Nearest preceding `<h1>`-`<h6>` in the same parent or section. */
  preceding_heading: string | null;
  /** `formControlName` carried on a wrapping element/component. */
  wrapper_formcontrolname: string | null;
  /** Resolved text of the element referenced by `aria-labelledby`. */
  aria_labelledby_text: string | null;
}

export interface SemanticAttributes {
  // --- Tier 0: legacy fields kept for backward compat -----------------------
  formcontrolname: string | null;
  name?: string | null;
  routerlink?: string | null;
  aria_label: string | null;
  placeholder: string | null;
  /** visible text, no interpolations */
  text_content: string | null;
  type: string | null;
  role?: string | null;

  // --- Tier 1: universal static HTML attributes ----------------------------
  title?: string | null;
  alt?: string | null;
  value?: string | null;
  html_id?: string | null;
  href?: string | null;
  src?: string | null;
  /** `<label for>` value (the `for` keyword is reserved in TS). */
  html_for?: string | null;
  /** `<input>`/`<button>`-style component label input as static attribute. */
  label?: string | null;

  // --- Tier 2: catch-all for everything else statically present ------------
  /** Any other static attribute (Angular `[input]="literal"` is normalised in here too). */
  static_attributes?: Record<string, string> | null;

  // --- Tier 3: bound-input identifiers (e.g. [data]="currentOrder") --------
  /** Maps input name → identifier path used in the binding (only simple paths). */
  bound_identifiers?: Record<string, string> | null;

  // --- Tier 4: event handler function names (e.g. (click)="saveOrder()") ---
  event_handlers?: Record<string, string> | null;

  // --- Tier 5: i18n keys / interpolation paths -----------------------------
  /** String literals fed into translation pipes/functions inside text. */
  i18n_keys?: string[] | null;
  /** Property paths read via `{{ … }}` interpolations (e.g. `order.id`). */
  bound_text_paths?: string[] | null;

  // --- Tier 8: surrounding-context anchors ---------------------------------
  context?: ContextAttributes | null;

  // passthrough for future semantic attributes
  [key: string]:
    | string
    | string[]
    | Record<string, string>
    | ContextAttributes
    | null
    | undefined;
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
  /**
   * Frozen Python variable name emitted by gen-locators. Set when
   * `locators.lockNames` is on so constants stay stable even if the entry's
   * semantics drift (e.g. aria-label rewordings). Absent = no lock-in yet.
   */
  locator_name?: string;
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
