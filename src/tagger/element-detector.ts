/**
 * Element detection + element-type mapping (FR-1.2, FR-1.7).
 *
 * Decides which AST elements should be tagged and maps their tag name to a
 * canonical `element_type` short-name that is used in the generated
 * data-testid string.
 */

import { DEFAULT_IGNORE_TAGS, type TaggerConfig } from './config-loader.js';
import {
  findAttribute,
  getTagName,
  type VisitedElement
} from './template-parser.js';

/**
 * Canonical short names used in the data-testid slot.
 *
 * The curated values below are what the tagger prefers for well-known tags
 * (PrimeNG, Angular Material, the common interactive natives). Since the
 * tagger now uses a denylist, *any* non-ignored tag produces a shortType —
 * when it's an unfamiliar tag, the slot is just the tag name (e.g. `div`,
 * `h1`, `article`). Therefore `ElementTypeShort` is a string with curated
 * suggestions, not a closed enum.
 */
export type ElementTypeShort =
  | 'input'
  | 'button'
  | 'select'
  | 'textarea'
  | 'link'
  | 'form'
  | 'dropdown'
  | 'checkbox'
  | 'radio'
  | 'calendar'
  | 'datepicker'
  | 'multiselect'
  | 'autocomplete'
  | 'dialog'
  | 'listbox'
  | 'table'
  | 'dataview'
  | 'form-field'
  | 'generic'
  | (string & {}); // NOLINT — keep literal suggestions visible to callers

/** Longer name written into the registry `element_type` field. */
export type ElementTypeLong = string;

export interface DetectedElement {
  tag: string;
  shortType: ElementTypeShort;
  longType: ElementTypeLong;
}

/** PrimeNG tag -> (short, long) mapping. */
const PRIMENG_MAP: Record<string, { short: ElementTypeShort; long: ElementTypeLong }> = {
  'p-dropdown': { short: 'dropdown', long: 'primeng_dropdown' },
  'p-select': { short: 'select', long: 'primeng_select' },
  'p-calendar': { short: 'calendar', long: 'primeng_calendar' },
  'p-datepicker': { short: 'datepicker', long: 'primeng_datepicker' },
  'p-checkbox': { short: 'checkbox', long: 'primeng_checkbox' },
  'p-radiobutton': { short: 'radio', long: 'primeng_radio' },
  'p-multiselect': { short: 'multiselect', long: 'primeng_multiselect' },
  'p-autocomplete': { short: 'autocomplete', long: 'primeng_autocomplete' },
  'p-inputtext': { short: 'input', long: 'primeng_input' },
  'p-dialog': { short: 'dialog', long: 'primeng_dialog' },
  'p-listbox': { short: 'listbox', long: 'primeng_listbox' },
  'p-table': { short: 'table', long: 'primeng_table' },
  'p-dataview': { short: 'dataview', long: 'primeng_dataview' },
  'p-button': { short: 'button', long: 'primeng_button' }
};

/** Angular Material tag -> (short, long). */
const MATERIAL_MAP: Record<string, { short: ElementTypeShort; long: ElementTypeLong }> = {
  'mat-select': { short: 'select', long: 'material_select' },
  'mat-checkbox': { short: 'checkbox', long: 'material_checkbox' },
  'mat-radio-button': { short: 'radio', long: 'material_radio' },
  'mat-form-field': { short: 'form-field', long: 'material_form_field' }
};

/** Native HTML tag -> (short, long). */
const NATIVE_MAP: Record<string, { short: ElementTypeShort; long: ElementTypeLong }> = {
  button: { short: 'button', long: 'native_button' },
  input: { short: 'input', long: 'native_input' },
  select: { short: 'select', long: 'native_select' },
  textarea: { short: 'textarea', long: 'native_textarea' },
  a: { short: 'link', long: 'native_link' },
  form: { short: 'form', long: 'native_form' }
};

/** Kebab-case slug for use in `data-testid` short-type / long-type strings. */
function slugTag(tag: string): string {
  // "p-dropdown" -> "p-dropdown"; "h1" -> "h1"; "my-custom-el" -> "my-custom-el"
  // Linear single-pass scan — no regex backtracking, collapses any run of
  // non-[a-z0-9] chars into a single hyphen and trims leading/trailing ones.
  let out = '';
  let pendingDash = false;
  let hasContent = false;
  for (let i = 0; i < tag.length; i++) {
    const code = tag.charCodeAt(i);
    const isAlnum =
      (code >= 48 && code <= 57) || (code >= 97 && code <= 122);
    if (isAlnum) {
      if (pendingDash && hasContent) out += '-';
      out += tag[i];
      hasContent = true;
      pendingDash = false;
    } else {
      pendingDash = true;
    }
  }
  return out || 'generic';
}

/**
 * Returns a `DetectedElement` for every element the tagger should emit a
 * testid for. The tagger uses a **denylist** approach (user-configurable via
 * {@link TaggerConfig.ignoreTags}): structural or non-rendered tags
 * (`ng-template`, `<script>`, `<style>`, etc.) are skipped, everything else
 * gets tagged. Known native / PrimeNG / Material tags keep their rich
 * short-type slug; unknown tags fall back to a generic slug derived from
 * their tag name so the testid is still stable and meaningful.
 */
export function detectElement(
  element: VisitedElement,
  config: TaggerConfig
): DetectedElement | null {
  const tag = getTagName(element).toLowerCase();

  // 0. Denylist short-circuit: structural tags never get a testid.
  const ignored = new Set<string>([
    ...DEFAULT_IGNORE_TAGS.map((t) => t.toLowerCase()),
    ...(config.ignoreTags ?? []).map((t) => t.toLowerCase())
  ]);
  if (ignored.has(tag)) return null;

  // 1. User-provided map overrides everything below. Lets the user name their
  // own components (`app-user-menu` → `menu`) and also override native defaults
  // if they want non-standard semantics.
  const customMap = config.customTagMap ?? {};
  const customEntry = customMap[tag] ?? customMap[getTagName(element)];
  if (customEntry) {
    return { tag, shortType: customEntry.shortType, longType: customEntry.longType };
  }

  // 2. Native — rich mapping (button/input get type-suffixed long names).
  if (NATIVE_MAP[tag]) {
    const base = NATIVE_MAP[tag];
    if (tag === 'input') {
      const typeAttr = findAttribute(element, 'type')?.value?.toLowerCase();
      const long = typeAttr ? `native_input_${typeAttr}` : base.long;
      return { tag, shortType: base.short, longType: long };
    }
    if (tag === 'button') {
      const typeAttr = findAttribute(element, 'type')?.value?.toLowerCase();
      const long = typeAttr ? `native_button_${typeAttr}` : base.long;
      return { tag, shortType: base.short, longType: long };
    }
    return { tag, shortType: base.short, longType: base.long };
  }

  // 3. PrimeNG — curated mapping keeps readable shortType (dropdown/select/...).
  if (PRIMENG_MAP[tag]) {
    const base = PRIMENG_MAP[tag];
    return { tag, shortType: base.short, longType: base.long };
  }

  // 4. Angular Material.
  if (MATERIAL_MAP[tag]) {
    const base = MATERIAL_MAP[tag];
    return { tag, shortType: base.short, longType: base.long };
  }

  // 5. Everything else — tag it with a tag-derived slug so headings, labels,
  // layout wrappers and custom components all get a stable testid. This is
  // the behaviour the denylist design implies: cover everything except the
  // structural tags listed above.
  const slug = slugTag(tag);
  return {
    tag,
    shortType: slug as ElementTypeShort,
    longType: `dom_${slug}`
  };
}

/* ---------------------------------------------------------------------- *
 * Dynamic-children pattern (FR-1.8)
 * ---------------------------------------------------------------------- */

export interface DynamicChildrenPatternSpec {
  pattern: (hostId: string) => string;
  addressing: readonly ('by_index' | 'by_text' | 'by_value' | 'by_date')[];
}

const DYNAMIC_CHILDREN_BY_TAG: Record<string, DynamicChildrenPatternSpec> = {
  'p-dropdown': {
    pattern: (id) =>
      `[data-testid='${id}'] ~ .p-select-overlay li, [data-testid='${id}'] ~ .p-dropdown-panel li`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-select': {
    pattern: (id) =>
      `[data-testid='${id}'] ~ .p-select-overlay li, [data-testid='${id}'] ~ .p-dropdown-panel li`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-multiselect': {
    pattern: (id) => `[data-testid='${id}'] ~ .p-multiselect-overlay li`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-calendar': {
    pattern: (id) => `[data-testid='${id}'] ~ .p-datepicker td.p-datepicker-day-cell`,
    addressing: ['by_index', 'by_date']
  },
  'p-datepicker': {
    pattern: (id) => `[data-testid='${id}'] ~ .p-datepicker td.p-datepicker-day-cell`,
    addressing: ['by_index', 'by_date']
  },
  'p-autocomplete': {
    pattern: (id) => `[data-testid='${id}'] ~ .p-autocomplete-overlay li`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-table': {
    pattern: (id) => `[data-testid='${id}'] tbody tr`,
    addressing: ['by_index', 'by_text']
  },
  'p-listbox': {
    pattern: (id) => `[data-testid='${id}'] .p-listbox-option`,
    addressing: ['by_index', 'by_text', 'by_value']
  }
};

/** Returns the dynamic-children spec for a given tag, or null if none applies. */
export function getDynamicChildrenSpec(tag: string): DynamicChildrenPatternSpec | null {
  return DYNAMIC_CHILDREN_BY_TAG[tag.toLowerCase()] ?? null;
}
