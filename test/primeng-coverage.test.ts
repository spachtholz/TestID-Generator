import { describe, it, expect } from 'vitest';
import { detectElement } from '../src/tagger/element-detector.js';
import { TaggerConfigSchema } from '../src/tagger/config-loader.js';
import {
  parseAngularTemplate,
  walkElements,
  getTagName
} from '../src/tagger/template-parser.js';

const config = TaggerConfigSchema.parse({});

function detectFromTag(tag: string) {
  const parsed = parseAngularTemplate(`<${tag}></${tag}>`, { url: 'test.html' });
  let detected: ReturnType<typeof detectElement> = null;
  walkElements(parsed.ast, (el) => {
    if (getTagName(el).toLowerCase() === tag) {
      detected = detectElement(el, config);
    }
  });
  return detected;
}

describe('PrimeNG element coverage', () => {
  // (tag, expectedShort, expectedLong)
  const cases: Array<[string, string, string]> = [
    // Existing baseline - sanity-check we didn't break the original 14
    ['p-dropdown', 'dropdown', 'primeng_dropdown'],
    ['p-button', 'button', 'primeng_button'],
    ['p-checkbox', 'checkbox', 'primeng_checkbox'],

    // Newly added: text-like inputs
    ['p-inputnumber', 'input', 'primeng_input_number'],
    ['p-inputmask', 'input', 'primeng_input_mask'],
    ['p-password', 'input', 'primeng_password'],
    ['p-textarea', 'textarea', 'primeng_textarea'],
    ['p-inputtextarea', 'textarea', 'primeng_textarea'],
    ['p-editor', 'textarea', 'primeng_editor'],
    ['p-chips', 'input', 'primeng_chips'],

    // Newly added: boolean / toggle (both old and new naming)
    ['p-inputswitch', 'checkbox', 'primeng_switch'],
    ['p-toggleswitch', 'checkbox', 'primeng_switch'],
    ['p-togglebutton', 'button', 'primeng_toggle_button'],
    ['p-tristatecheckbox', 'checkbox', 'primeng_tristate_checkbox'],

    // Numeric / range
    ['p-rating', 'input', 'primeng_rating'],
    ['p-slider', 'input', 'primeng_slider'],
    ['p-knob', 'input', 'primeng_knob'],
    ['p-colorpicker', 'input', 'primeng_colorpicker'],

    // Files & buttons
    ['p-fileupload', 'input', 'primeng_fileupload'],
    ['p-splitbutton', 'button', 'primeng_split_button'],

    // Selects
    ['p-cascadeselect', 'select', 'primeng_cascadeselect'],
    ['p-treeselect', 'select', 'primeng_treeselect'],

    // Data
    ['p-tree', 'tree', 'primeng_tree'],
    ['p-treetable', 'table', 'primeng_treetable'],
    ['p-orderlist', 'listbox', 'primeng_orderlist'],
    ['p-picklist', 'listbox', 'primeng_picklist'],
    ['p-paginator', 'paginator', 'primeng_paginator'],

    // Overlays (renamed in v17+)
    ['p-popover', 'dialog', 'primeng_popover'],
    ['p-drawer', 'dialog', 'primeng_drawer'],
    ['p-confirmdialog', 'dialog', 'primeng_confirm_dialog'],

    // Messages
    ['p-toast', 'message', 'primeng_toast'],
    ['p-message', 'message', 'primeng_message']
  ];

  it.each(cases)('detects %s as %s / %s', (tag, expectedShort, expectedLong) => {
    const detected = detectFromTag(tag);
    expect(detected).not.toBeNull();
    expect(detected!.shortType).toBe(expectedShort);
    expect(detected!.longType).toBe(expectedLong);
  });
});
