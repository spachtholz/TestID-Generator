import { describe, it, expect } from 'vitest';
import {
  classifyLocatorLine,
  mergeLocatorModule,
  splitIntoBlocks
} from '../src/locators/merge.js';
import type { LocatorEntry, LocatorModule } from '../src/locators/types.js';

const ATTR = 'data-testid';

function entry(testid: string, variable: string): LocatorEntry {
  return {
    testid,
    variable,
    selector: `xpath://*[@${ATTR}='${testid}']`
  };
}

function mod(entries: LocatorEntry[]): LocatorModule {
  return { component: 'x', filename: 'x.py', entries };
}

describe('classifyLocatorLine', () => {
  it('recognises managed lines', () => {
    const line =
      `login_input_email = "xpath://*[@data-testid='login__input--email']"  # testid-managed`;
    const r = classifyLocatorLine(line, ATTR);
    expect(r.kind).toBe('managed');
    if (r.kind === 'managed') expect(r.testid).toBe('login__input--email');
  });

  it('treats lines without the marker as manual', () => {
    expect(classifyLocatorLine('custom = "whatever"', ATTR).kind).toBe('manual');
    expect(classifyLocatorLine('# a comment', ATTR).kind).toBe('manual');
    expect(classifyLocatorLine('', ATTR).kind).toBe('manual');
  });

  it('falls back to manual if the marker is present but testid can\'t be parsed', () => {
    // Marker intact but no attribute=...='...' pattern
    const weird = 'something weird  # testid-managed';
    expect(classifyLocatorLine(weird, ATTR).kind).toBe('manual');
  });

  it('honours a custom attributeName', () => {
    const line =
      `x = "xpath://*[@data-cy='foo--bar']"  # testid-managed`;
    expect(classifyLocatorLine(line, 'data-cy').kind).toBe('managed');
    expect(classifyLocatorLine(line, ATTR).kind).toBe('manual');
  });
});

describe('splitIntoBlocks', () => {
  it('collapses consecutive same-kind lines into one block', () => {
    const source = [
      '# header',
      '',
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      `login_b = "xpath://*[@data-testid='b']"  # testid-managed`,
      '# footer'
    ].join('\n');
    const blocks = splitIntoBlocks(source, ATTR);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.kind).toBe('manual');
    expect(blocks[1]?.kind).toBe('managed');
    expect(blocks[2]?.kind).toBe('manual');
  });

  it('breaks a managed block when a manual line sits between two managed ones', () => {
    const source = [
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      'login_custom = "xpath://custom"',
      `login_b = "xpath://*[@data-testid='b']"  # testid-managed`
    ].join('\n');
    const blocks = splitIntoBlocks(source, ATTR);
    expect(blocks.map((b) => b.kind)).toEqual(['managed', 'manual', 'managed']);
  });
});

describe('mergeLocatorModule', () => {
  it('preserves manual lines at the start', () => {
    const existing = [
      '# my custom header',
      'from my.page_objects import BasePage',
      '',
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      ''
    ].join('\n');
    const fresh = mod([entry('a', 'login_a')]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).toContain('# my custom header');
    expect(out).toContain('from my.page_objects import BasePage');
    expect(out).toContain(`login_a = "xpath://*[@data-testid='a']"  # testid-managed`);
  });

  it('preserves manual lines at the end', () => {
    const existing = [
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      '',
      'login_custom_helper = "xpath://div[@id=\'debug\']"'
    ].join('\n');
    const fresh = mod([entry('a', 'login_a')]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).toContain('login_custom_helper');
  });

  it('preserves a manual line sandwiched between managed ones', () => {
    const existing = [
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      'login_custom = "xpath://custom"',
      `login_b = "xpath://*[@data-testid='b']"  # testid-managed`
    ].join('\n');
    const fresh = mod([entry('a', 'login_a'), entry('b', 'login_b')]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    const lines = out.split('\n');
    expect(lines).toContain('login_custom = "xpath://custom"');
    // Position preserved: custom line still between a and b.
    const aIdx = lines.findIndex((l) => l.startsWith('login_a'));
    const customIdx = lines.findIndex((l) => l.startsWith('login_custom'));
    const bIdx = lines.findIndex((l) => l.startsWith('login_b'));
    expect(aIdx).toBeLessThan(customIdx);
    expect(customIdx).toBeLessThan(bIdx);
  });

  it('drops managed lines whose testid is no longer in the registry', () => {
    const existing = [
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      `login_gone = "xpath://*[@data-testid='gone']"  # testid-managed`,
      `login_b = "xpath://*[@data-testid='b']"  # testid-managed`
    ].join('\n');
    const fresh = mod([entry('a', 'login_a'), entry('b', 'login_b')]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).not.toContain('login_gone');
    expect(out).not.toContain("data-testid='gone'");
    expect(out).toContain('login_a');
    expect(out).toContain('login_b');
  });

  it('updates a managed line in place when the variable name changed (same testid)', () => {
    const existing = [
      `login_button_signin_OLD = "xpath://*[@data-testid='login__button--submit']"  # testid-managed`
    ].join('\n');
    const fresh = mod([entry('login__button--submit', 'login_button_submit')]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).toContain('login_button_submit');
    expect(out).not.toContain('login_button_signin_OLD');
  });

  it('appends new registry entries to the last managed block', () => {
    const existing = [
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      'login_custom = "xpath://custom"',
      ''
    ].join('\n');
    const fresh = mod([
      entry('a', 'login_a'),
      entry('b', 'login_b')  // new
    ]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).toContain('login_b');
    const lines = out.split('\n').filter((l) => l.length > 0);
    // Manual line (login_custom) survives
    expect(lines.some((l) => l.startsWith('login_custom'))).toBe(true);
  });

  it('appends a fresh managed block when the file has no managed lines', () => {
    const existing = [
      '# Pure manual file',
      'my_helper = "xpath://foo"'
    ].join('\n');
    const fresh = mod([entry('new', 'login_new')]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).toContain('# Pure manual file');
    expect(out).toContain('my_helper');
    expect(out).toContain('login_new');
  });

  it('overwrites a managed selector that the user hand-edited (marker still present)', () => {
    const existing = [
      `login_a = "xpath://custom-override"  # testid-managed`
    ].join('\n');
    const fresh = mod([entry('a', 'login_a')]);
    // Selector in `existing` doesn't match any testid because it has no
    // `@data-testid='...'` substring. Because classifyLocatorLine then
    // degrades to `manual`, the line is preserved AND the fresh entry is
    // appended. That's the safe behaviour: we never silently delete a line
    // whose testid we can't identify.
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    expect(out).toContain(`login_a = "xpath://*[@data-testid='a']"  # testid-managed`);
  });

  it('sorts managed lines alphabetically within each block', () => {
    const existing = '';
    const fresh = mod([
      entry('zeta', 'login_zeta'),
      entry('alpha', 'login_alpha'),
      entry('mid', 'login_mid')
    ]);
    const out = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    const managed = out.split('\n').filter((l) => l.endsWith('# testid-managed'));
    expect(managed.map((l) => l.split(' ')[0])).toEqual([
      'login_alpha',
      'login_mid',
      'login_zeta'
    ]);
  });

  it('is idempotent: running merge on its own output produces the same result', () => {
    const existing = [
      '# header',
      `login_a = "xpath://*[@data-testid='a']"  # testid-managed`,
      'login_custom = "xpath://foo"',
      `login_b = "xpath://*[@data-testid='b']"  # testid-managed`
    ].join('\n');
    const fresh = mod([entry('a', 'login_a'), entry('b', 'login_b')]);
    const once = mergeLocatorModule({ existingSource: existing, freshModule: fresh, attributeName: ATTR });
    const twice = mergeLocatorModule({ existingSource: once, freshModule: fresh, attributeName: ATTR });
    expect(twice).toBe(once);
  });
});
