import { describe, it, expect } from 'vitest';
import { diffRegistries, exitCodeForDiff } from '../src/differ/diff-algorithm.js';
import { renderDiffMarkdown, renderDiffJson } from '../src/differ/report-generator.js';
import type { Registry, RegistryEntry } from '@testid/registry';

function mkReg(version: number, entries: Record<string, RegistryEntry>): Registry {
  return {
    $schema: './testid-registry.schema.json',
    version,
    generated_at: '1970-01-01T00:00:00Z',
    build_id: null,
    app_version: null,
    framework_versions: {},
    entries
  };
}

function mkEntry(overrides: Partial<RegistryEntry> & { fingerprint: string; component?: string; tag?: string }): RegistryEntry {
  return {
    component: overrides.component ?? 'order-form.component.html',
    tag: overrides.tag ?? 'p-dropdown',
    element_type: 'primeng_dropdown',
    fingerprint: overrides.fingerprint,
    semantic: {
      formcontrolname: 'customer',
      placeholder: 'Kunde wählen',
      aria_label: null,
      text_content: null,
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1,
    ...overrides
  };
}

describe('diffRegistries', () => {
  it('detects unchanged + added + removed + renamed + modified', () => {
    const oldReg = mkReg(42, {
      'order-form__dropdown--customer': mkEntry({
        fingerprint: 'p-dropdown|formcontrolname=customer|placeholder=Kunde wählen',
        tag: 'p-dropdown'
      }),
      'order-form__input--quantity': mkEntry({
        fingerprint: 'input|formcontrolname=quantity',
        tag: 'input'
      }),
      'order-form__button--delete': mkEntry({
        fingerprint: 'button|text=Löschen',
        tag: 'button'
      })
    });
    const newReg = mkReg(43, {
      // unchanged
      'order-form__input--quantity': mkEntry({
        fingerprint: 'input|formcontrolname=quantity',
        tag: 'input'
      }),
      // renamed: p-dropdown to p-select with same semantics
      'order-form__select--customer': mkEntry({
        fingerprint: 'p-select|formcontrolname=customer|placeholder=Kunde wählen',
        tag: 'p-select'
      }),
      // added
      'order-form__button--submit': mkEntry({
        fingerprint: 'button|text=Speichern',
        tag: 'button',
        semantic: {
          formcontrolname: null,
          placeholder: null,
          aria_label: null,
          text_content: 'Speichern',
          type: 'submit'
        }
      })
    });

    const diff = diffRegistries(oldReg, newReg, { now: '2026-04-16T10:35:00Z' });

    expect(diff.from_version).toBe(42);
    expect(diff.to_version).toBe(43);
    expect(diff.summary.unchanged).toBe(1);
    expect(diff.summary.renamed).toBe(1);
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.removed).toBe(1);

    expect(diff.renamed[0]?.old_id).toBe('order-form__dropdown--customer');
    expect(diff.renamed[0]?.new_id).toBe('order-form__select--customer');
    expect(diff.renamed[0]!.confidence).toBeGreaterThanOrEqual(0.8);

    expect(diff.added[0]?.id).toBe('order-form__button--submit');
    expect(diff.removed[0]?.id).toBe('order-form__button--delete');

    expect(exitCodeForDiff(diff)).toBe(1);
  });

  it('flags same-id-different-fingerprint as modified', () => {
    const oldReg = mkReg(1, {
      'login__input--email': mkEntry({
        fingerprint: 'input|formcontrolname=email|type=email',
        tag: 'input'
      })
    });
    const newReg = mkReg(2, {
      'login__input--email': mkEntry({
        fingerprint: 'input|formcontrolname=email|type=text',
        tag: 'input'
      })
    });
    const diff = diffRegistries(oldReg, newReg);
    expect(diff.summary.modified).toBe(1);
    expect(diff.modified[0]?.id).toBe('login__input--email');
    expect(exitCodeForDiff(diff)).toBe(1);
  });

  it('exits 0 when there are no changes or only additions', () => {
    const oldReg = mkReg(1, {});
    const newReg = mkReg(2, {
      'x__input--a': mkEntry({ fingerprint: 'input|name=a' })
    });
    expect(exitCodeForDiff(diffRegistries(oldReg, newReg))).toBe(0);
  });
});

describe('report output', () => {
  it('renders deterministic JSON with sorted keys', () => {
    const oldReg = mkReg(1, {
      'a__button--x': mkEntry({ fingerprint: 'button|text=X' })
    });
    const newReg = mkReg(2, {
      'a__button--x': mkEntry({ fingerprint: 'button|text=X' })
    });
    const diff = diffRegistries(oldReg, newReg, { now: '2026-04-16T10:35:00Z' });
    const j1 = renderDiffJson(diff);
    const j2 = renderDiffJson(diff);
    expect(j1).toBe(j2);
    // sanity: summary keys come out alphabetical
    expect(j1.indexOf('"added"')).toBeLessThan(j1.indexOf('"unchanged"'));
  });

  it('markdown includes a summary table + renamed table when renames exist', () => {
    const oldReg = mkReg(1, {
      'order-form__dropdown--customer': mkEntry({
        fingerprint: 'p-dropdown|formcontrolname=customer|placeholder=Kunde wählen'
      })
    });
    const newReg = mkReg(2, {
      'order-form__select--customer': mkEntry({
        fingerprint: 'p-select|formcontrolname=customer|placeholder=Kunde wählen',
        tag: 'p-select'
      })
    });
    const md = renderDiffMarkdown(diffRegistries(oldReg, newReg));
    expect(md).toContain('# Testid Registry Diff: v1 to v2');
    expect(md).toContain('## Summary');
    expect(md).toContain('## Renamed');
    expect(md).toContain('order-form__dropdown--customer');
    expect(md).toContain('order-form__select--customer');
  });
});

describe('regenerated detection', () => {
  it('keeps regenerated ids in `added` when the flag is off (default)', () => {
    const oldReg = mkReg(2, {});
    const newReg = mkReg(3, {
      'foo__button--x': mkEntry({
        fingerprint: 'button|text=X',
        tag: 'button',
        first_seen_version: 1,
        last_seen_version: 3,
        generation_history: [1, 3]
      })
    });
    const diff = diffRegistries(oldReg, newReg);
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.regenerated).toBe(0);
  });

  it('splits regenerated ids out of `added` when the flag is on', () => {
    const oldReg = mkReg(2, {});
    const newReg = mkReg(3, {
      'truly-new': mkEntry({
        fingerprint: 'button|text=New',
        tag: 'button',
        first_seen_version: 3,
        last_seen_version: 3,
        generation_history: [3]
      }),
      'regenerated-one': mkEntry({
        fingerprint: 'button|text=Back',
        tag: 'button',
        first_seen_version: 1,
        last_seen_version: 3,
        generation_history: [1, 3],
        last_generated_at: '2026-04-17T10:00:00Z'
      })
    });
    const diff = diffRegistries(oldReg, newReg, { showRegenerated: true });
    expect(diff.summary.added).toBe(1);
    expect(diff.summary.regenerated).toBe(1);
    expect(diff.added[0]?.id).toBe('truly-new');
    expect(diff.regenerated[0]?.id).toBe('regenerated-one');
    expect(diff.regenerated[0]?.first_seen_version).toBe(1);
    expect(diff.regenerated[0]?.previous_version).toBe(1);
    expect(diff.regenerated[0]?.last_generated_at).toBe('2026-04-17T10:00:00Z');
  });

  it('markdown includes the regenerated table when entries exist', () => {
    const oldReg = mkReg(2, {});
    const newReg = mkReg(3, {
      'returning-id': mkEntry({
        fingerprint: 'f',
        first_seen_version: 1,
        last_seen_version: 3,
        generation_history: [1, 3]
      })
    });
    const diff = diffRegistries(oldReg, newReg, { showRegenerated: true });
    const md = renderDiffMarkdown(diff);
    expect(md).toContain('## Regenerated');
    expect(md).toContain('returning-id');
  });
});
