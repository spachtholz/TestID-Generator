// Element detection + shortType mapping.

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
  | 'message'
  | 'paginator'
  | 'tree'
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
  // Selects / dropdowns
  'p-dropdown': { short: 'dropdown', long: 'primeng_dropdown' },
  'p-select': { short: 'select', long: 'primeng_select' },
  'p-multiselect': { short: 'multiselect', long: 'primeng_multiselect' },
  'p-cascadeselect': { short: 'select', long: 'primeng_cascadeselect' },
  'p-treeselect': { short: 'select', long: 'primeng_treeselect' },
  'p-listbox': { short: 'listbox', long: 'primeng_listbox' },
  'p-autocomplete': { short: 'autocomplete', long: 'primeng_autocomplete' },
  'p-mention': { short: 'input', long: 'primeng_mention' },

  // Date / time
  'p-calendar': { short: 'calendar', long: 'primeng_calendar' },
  'p-datepicker': { short: 'datepicker', long: 'primeng_datepicker' },

  // Text-like inputs
  'p-inputtext': { short: 'input', long: 'primeng_input' },
  'p-inputnumber': { short: 'input', long: 'primeng_input_number' },
  'p-inputmask': { short: 'input', long: 'primeng_input_mask' },
  'p-password': { short: 'input', long: 'primeng_password' },
  'p-textarea': { short: 'textarea', long: 'primeng_textarea' },
  'p-inputtextarea': { short: 'textarea', long: 'primeng_textarea' },
  'p-editor': { short: 'textarea', long: 'primeng_editor' },
  'p-chips': { short: 'input', long: 'primeng_chips' },
  'p-iconfield': { short: 'form-field', long: 'primeng_iconfield' },
  'p-floatlabel': { short: 'form-field', long: 'primeng_floatlabel' },

  // Boolean / choice
  'p-checkbox': { short: 'checkbox', long: 'primeng_checkbox' },
  'p-tristatecheckbox': { short: 'checkbox', long: 'primeng_tristate_checkbox' },
  'p-radiobutton': { short: 'radio', long: 'primeng_radio' },
  'p-inputswitch': { short: 'checkbox', long: 'primeng_switch' },
  'p-toggleswitch': { short: 'checkbox', long: 'primeng_switch' },
  'p-togglebutton': { short: 'button', long: 'primeng_toggle_button' },

  // Numeric / range
  'p-rating': { short: 'input', long: 'primeng_rating' },
  'p-slider': { short: 'input', long: 'primeng_slider' },
  'p-knob': { short: 'input', long: 'primeng_knob' },
  'p-colorpicker': { short: 'input', long: 'primeng_colorpicker' },

  // Files
  'p-fileupload': { short: 'input', long: 'primeng_fileupload' },

  // Buttons
  'p-button': { short: 'button', long: 'primeng_button' },
  'p-splitbutton': { short: 'button', long: 'primeng_split_button' },
  'p-speeddial': { short: 'button', long: 'primeng_speeddial' },

  // Data
  'p-table': { short: 'table', long: 'primeng_table' },
  'p-treetable': { short: 'table', long: 'primeng_treetable' },
  'p-tree': { short: 'tree', long: 'primeng_tree' },
  'p-dataview': { short: 'dataview', long: 'primeng_dataview' },
  'p-orderlist': { short: 'listbox', long: 'primeng_orderlist' },
  'p-picklist': { short: 'listbox', long: 'primeng_picklist' },
  'p-paginator': { short: 'paginator', long: 'primeng_paginator' },
  'p-virtualscroller': { short: 'generic', long: 'primeng_virtualscroller' },
  'p-carousel': { short: 'generic', long: 'primeng_carousel' },
  'p-galleria': { short: 'generic', long: 'primeng_galleria' },

  // Overlays / dialogs
  'p-dialog': { short: 'dialog', long: 'primeng_dialog' },
  'p-confirmdialog': { short: 'dialog', long: 'primeng_confirm_dialog' },
  'p-dynamicdialog': { short: 'dialog', long: 'primeng_dynamic_dialog' },
  'p-overlaypanel': { short: 'dialog', long: 'primeng_overlay_panel' },
  'p-popover': { short: 'dialog', long: 'primeng_popover' },
  'p-sidebar': { short: 'dialog', long: 'primeng_sidebar' },
  'p-drawer': { short: 'dialog', long: 'primeng_drawer' },

  // Messages
  'p-message': { short: 'message', long: 'primeng_message' },
  'p-messages': { short: 'message', long: 'primeng_messages' },
  'p-inlinemessage': { short: 'message', long: 'primeng_inline_message' },
  'p-toast': { short: 'message', long: 'primeng_toast' }
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
 * Dynamic-children pattern
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
  'p-cascadeselect': {
    pattern: (id) => `[data-testid='${id}'] ~ .p-cascadeselect-overlay li`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-treeselect': {
    pattern: (id) =>
      `[data-testid='${id}'] ~ .p-treeselect-overlay .p-tree-node-content`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-tree': {
    pattern: (id) => `[data-testid='${id}'] .p-tree-node-content`,
    addressing: ['by_index', 'by_text']
  },
  'p-treetable': {
    pattern: (id) => `[data-testid='${id}'] tbody tr`,
    addressing: ['by_index', 'by_text']
  },
  'p-orderlist': {
    pattern: (id) => `[data-testid='${id}'] .p-orderlist-item`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-picklist': {
    pattern: (id) => `[data-testid='${id}'] .p-picklist-item`,
    addressing: ['by_index', 'by_text', 'by_value']
  },
  'p-paginator': {
    pattern: (id) => `[data-testid='${id}'] .p-paginator-page`,
    addressing: ['by_index']
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
