// Element detection + shortType mapping (FR-1.2, FR-1.7).

import { DEFAULT_IGNORE_TAGS, type TaggerConfig } from './config-loader.js';
import {
  findAttribute,
  getTagName,
  type VisitedElement
} from './template-parser.js';

/** Curated suggestions, not a closed enum - unknown tags get a slug. */
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
  | (string & {}); // NOLINT - keep literal suggestions visible to callers

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

function slugTag(tag: string): string {
  // linear scan, no regex backtracking (CodeQL flagged the prior regex version)
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

/** null = tag is in the denylist and should not receive a testid */
export function detectElement(
  element: VisitedElement,
  config: TaggerConfig
): DetectedElement | null {
  const tag = getTagName(element).toLowerCase();

  const ignored = new Set<string>([
    ...DEFAULT_IGNORE_TAGS.map((t) => t.toLowerCase()),
    ...(config.ignoreTags ?? []).map((t) => t.toLowerCase())
  ]);
  if (ignored.has(tag)) return null;

  // customTagMap wins over every built-in mapping
  const customMap = config.customTagMap ?? {};
  const customEntry = customMap[tag] ?? customMap[getTagName(element)];
  if (customEntry) {
    return { tag, shortType: customEntry.shortType, longType: customEntry.longType };
  }

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

  if (PRIMENG_MAP[tag]) {
    const base = PRIMENG_MAP[tag];
    return { tag, shortType: base.short, longType: base.long };
  }

  if (MATERIAL_MAP[tag]) {
    const base = MATERIAL_MAP[tag];
    return { tag, shortType: base.short, longType: base.long };
  }

  // fallback: tag-derived slug
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
