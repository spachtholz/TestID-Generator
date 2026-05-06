// Locator-name semantic discrimination: when two registry entries produce
// the same bare variable name but their semantic snapshots actually differ
// in some other field (event handler, fieldset legend, formcontrolname,
// preceding heading, …), append that field's value as a readable suffix
// instead of the noisy `_2`/`_3` fallback. The numeric fallback only fires
// when nothing in the semantic snapshot can split the group.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import {
  createEmptyRegistry,
  type Registry,
  type RegistryEntry
} from '../src/registry/schema.js';

function baseEntry(overrides: Partial<RegistryEntry> & { fingerprint: string }): RegistryEntry {
  return {
    component: 'src/order.component.html',
    tag: 'button',
    element_type: 'native_button',
    semantic: {
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: 'Save',
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1,
    ...overrides
  };
}

describe('locator-name semantic discriminator', () => {
  let outDir = '';

  beforeEach(async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-semdisc-'));
    outDir = path.join(tmp, 'locators');
  });

  afterEach(async () => {
    await fs.rm(path.dirname(outDir), { recursive: true, force: true });
  });

  it('uses event_handlers.click to disambiguate two buttons sharing the same text', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveAddress' }
          }
        }),
        'order__button--save-bbbb': baseEntry({
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveBilling' }
          }
        })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('order_nativeButton_save_saveAddress');
    expect(py).toContain('order_nativeButton_save_saveBilling');
    expect(py).not.toMatch(/order_nativeButton_save_2\b/);
  });

  it('uses fieldset_legend to disambiguate two wrapper divs with identical inner content', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__div--card-aaaa': {
          component: 'src/order.component.html',
          tag: 'div',
          element_type: 'dom_div',
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null,
            child_shape: ['h3:adresse', 'p'],
            context: {
              label_for: null,
              wrapper_label: null,
              fieldset_legend: 'Lieferadresse',
              preceding_heading: null,
              wrapper_formcontrolname: null,
              aria_labelledby_text: null
            }
          },
          first_seen_version: 1,
          last_seen_version: 1
        },
        'order__div--card-bbbb': {
          component: 'src/order.component.html',
          tag: 'div',
          element_type: 'dom_div',
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: null,
            type: null,
            child_shape: ['h3:adresse', 'p'],
            context: {
              label_for: null,
              wrapper_label: null,
              fieldset_legend: 'Rechnungsadresse',
              preceding_heading: null,
              wrapper_formcontrolname: null,
              aria_labelledby_text: null
            }
          },
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    // The fieldset_legend distinguishes the two cards even though child_shape
    // and primary text are identical.
    expect(py).toContain('lieferadresse');
    expect(py).toContain('rechnungsadresse');
    expect(py).not.toMatch(/_2\b/);
  });

  it('falls back to _N when no semantic field can split the group', async () => {
    // Two entries with byte-identical semantics - only the testid hash differs.
    // Nothing in the snapshot can split them, so the legacy numeric suffix
    // takes over.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({ fingerprint: 'fp-A' }),
        'order__button--save-bbbb': baseEntry({ fingerprint: 'fp-B' })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toMatch(/^order_nativeButton_save\s*=/m);
    expect(py).toMatch(/^order_nativeButton_save_2\s*=/m);
  });

  it('keeps a frozen name while a colliding unfrozen entry takes a semantic suffix', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(2, '2026-04-17T11:00:00Z'),
      entries: {
        // Older entry - already locked under the bare `save`.
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          locator_name: 'order_nativeButton_save',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveAddress' }
          }
        }),
        // New entry would compute the same bare name; should pick up its
        // own click handler as a discriminator instead of becoming `save_2`.
        'order__button--save-bbbb': baseEntry({
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveBilling' }
          }
        })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toMatch(/^order_nativeButton_save\s*=/m);
    expect(py).toContain('order_nativeButton_save_saveBilling');
    // The frozen entry must NOT have been renamed to `save_saveAddress`.
    expect(py).not.toContain('order_nativeButton_save_saveAddress');

    // And the frozen entry's locator_name in the registry stays untouched.
    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save'
    );
    expect(registry.entries['order__button--save-bbbb']!.locator_name).toBe(
      'order_nativeButton_save_saveBilling'
    );
  });

  it('skips the discriminator when its value would equal the entry primary', async () => {
    // Both buttons have `aria_label === text_content === "Save"`. text wins
    // the primary slot; aria_label as a candidate discriminator would just
    // append `_save` (redundant). The resolver must reject same-as-primary
    // values and fall through.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: 'Save',
            placeholder: null,
            text_content: 'Save',
            type: null
          }
        }),
        'order__button--save-bbbb': baseEntry({
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: 'Save',
            placeholder: null,
            text_content: 'Save',
            type: null
          }
        })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    // No `_save_save` redundancy - both entries are truly identical for our
    // purposes, so the numeric suffix takes over.
    expect(py).not.toMatch(/save_save\b/);
    expect(py).toMatch(/^order_nativeButton_save\s*=/m);
    expect(py).toMatch(/^order_nativeButton_save_2\s*=/m);
  });

  it('discriminates three colliding buttons by their distinct click handlers', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-1111': baseEntry({
          fingerprint: 'fp-1',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveAddress' }
          }
        }),
        'order__button--save-2222': baseEntry({
          fingerprint: 'fp-2',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveBilling' }
          }
        }),
        'order__button--save-3333': baseEntry({
          fingerprint: 'fp-3',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveShipping' }
          }
        })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('order_nativeButton_save_saveAddress');
    expect(py).toContain('order_nativeButton_save_saveBilling');
    expect(py).toContain('order_nativeButton_save_saveShipping');
    // No numeric suffix anywhere.
    expect(py).not.toMatch(/_(\d)\b/);
  });

  it('walks the fingerprint string when the first divergence is in css_class', async () => {
    // Two buttons with identical text/aria/handlers - only the CSS class
    // differs. The fingerprint encodes that as `class=primary` vs
    // `class=secondary`. The fingerprint-walk pass must pick the class value
    // up directly so the suffix is `_primary` / `_secondary`, not `_2`.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint:
            'button|text=Save|class=primary',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            css_classes: ['primary']
          }
        }),
        'order__button--save-bbbb': baseEntry({
          fingerprint:
            'button|text=Save|class=secondary',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            css_classes: ['secondary']
          }
        })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('order_nativeButton_save_primary');
    expect(py).toContain('order_nativeButton_save_secondary');
    expect(py).not.toMatch(/order_nativeButton_save_2\b/);
  });

  it('walks past shared fingerprint prefix to the first diverging field', async () => {
    // Three siblings share `text=Save` and `event.click=submit`, then
    // diverge in `attr.severity`. The walk skips the matching prefix and
    // picks severity values as the suffix source.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__button--save-1111': baseEntry({
          fingerprint:
            'button|text=Save|event.click=submit|attr.severity=info',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'submit' },
            static_attributes: { severity: 'info' }
          }
        }),
        'order__button--save-2222': baseEntry({
          fingerprint:
            'button|text=Save|event.click=submit|attr.severity=warning',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'submit' },
            static_attributes: { severity: 'warning' }
          }
        }),
        'order__button--save-3333': baseEntry({
          fingerprint:
            'button|text=Save|event.click=submit|attr.severity=danger',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'submit' },
            static_attributes: { severity: 'danger' }
          }
        })
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('order_nativeButton_save_info');
    expect(py).toContain('order_nativeButton_save_warning');
    expect(py).toContain('order_nativeButton_save_danger');
    expect(py).not.toMatch(/_(\d)\b/);
  });

  it('asymmetric child_shape: one wrapper has children, the other is empty - both get readable suffixes', async () => {
    // Asymmetric case: two structurally similar wrappers, one filled with
    // content, one self-closing/empty. Strict pass rejects
    // child_shape because the empty side returns undefined; the loose pass
    // ('none' sentinel) lets the field disambiguate so neither member has
    // to fall through to the numeric/hash suffix.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__div--card-aaaa': {
          component: 'src/order.component.html',
          tag: 'div',
          element_type: 'dom_div',
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Card',
            type: null,
            child_shape: ['h3:adresse', 'p:hauptstr-12']
          },
          first_seen_version: 1,
          last_seen_version: 1
        },
        'order__div--card-bbbb': {
          component: 'src/order.component.html',
          tag: 'div',
          element_type: 'dom_div',
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Card',
            type: null,
            child_shape: []
          },
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    // Compact form: the first diverging child position wins, not the full
    // chain. A's first child differs from B's empty side at position 0.
    expect(py).toContain('order_domDiv_card_h3Adresse');
    expect(py).toContain('order_domDiv_card_none');
    expect(py).not.toMatch(/order_domDiv_card_2\b/);
    // Full chain must NOT appear - that was the readability problem.
    expect(py).not.toContain('h3AdressePHauptstr12');
  });

  it('compacts child_shape to the first diverging child when prefixes match', async () => {
    // Both wrappers start with `h3:title` and `p:subtitle`, then diverge at
    // position 2. The compact suffix uses just `img:logo` / `span:badge`,
    // not the full `h3TitlePSubtitleImgLogo` chain.
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-05-05T10:00:00Z'),
      entries: {
        'order__div--card-aaaa': {
          component: 'src/order.component.html',
          tag: 'div',
          element_type: 'dom_div',
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Card',
            type: null,
            child_shape: ['h3:title', 'p:subtitle', 'img:logo']
          },
          first_seen_version: 1,
          last_seen_version: 1
        },
        'order__div--card-bbbb': {
          component: 'src/order.component.html',
          tag: 'div',
          element_type: 'dom_div',
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Card',
            type: null,
            child_shape: ['h3:title', 'p:subtitle', 'span:badge']
          },
          first_seen_version: 1,
          last_seen_version: 1
        }
      }
    };

    await generateLocators(registry, { outDir, lockNames: true });
    const py = await fs.readFile(path.join(outDir, 'order.py'), 'utf8');

    expect(py).toContain('order_domDiv_card_imgLogo');
    expect(py).toContain('order_domDiv_card_spanBadge');
    // The shared prefix (h3Title, pSubtitle) must NOT leak into the suffix.
    expect(py).not.toMatch(/h3Title|pSubtitle/);
  });

  it('persists the semantically-discriminated name back to the registry under lockNames', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order__button--save-aaaa': baseEntry({
          fingerprint: 'fp-A',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveAddress' }
          }
        }),
        'order__button--save-bbbb': baseEntry({
          fingerprint: 'fp-B',
          semantic: {
            formcontrolname: null,
            aria_label: null,
            placeholder: null,
            text_content: 'Save',
            type: null,
            event_handlers: { click: 'saveBilling' }
          }
        })
      }
    };

    const registryPath = path.join(path.dirname(outDir), 'testids.latest.json');
    const result = await generateLocators(registry, {
      outDir,
      registryPath,
      lockNames: true
    });
    expect(result.registryWritten).toBe(true);

    expect(registry.entries['order__button--save-aaaa']!.locator_name).toBe(
      'order_nativeButton_save_saveAddress'
    );
    expect(registry.entries['order__button--save-bbbb']!.locator_name).toBe(
      'order_nativeButton_save_saveBilling'
    );
  });
});
