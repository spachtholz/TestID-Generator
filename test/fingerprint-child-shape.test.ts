// child_shape: tag sequence of immediate element children, in source order.
// Used as a low-priority discriminator that kills wrapper-collision cases
// where two structurally-identical containers wrap different content.

import { describe, it, expect } from 'vitest';
import { parseAngularTemplate, walkElements, getTagName, type VisitedElement } from '../src/tagger/template-parser.js';
import { generateFingerprint } from '../src/tagger/fingerprint-generator.js';
import type { TmplAstNode } from '@angular/compiler';

function findAll(html: string, tag: string): { hits: VisitedElement[]; rootNodes: TmplAstNode[] } {
  const parsed = parseAngularTemplate(html);
  const hits: VisitedElement[] = [];
  walkElements(parsed.ast, (el) => {
    if (getTagName(el).toLowerCase() === tag) hits.push(el);
  });
  return { hits, rootNodes: parsed.ast };
}

describe('child_shape fingerprint field', () => {
  it('captures the tag sequence of immediate children', () => {
    const { hits, rootNodes } = findAll(
      `<div><span></span><button></button></div>`,
      'div'
    );
    const fp = generateFingerprint(hits[0]!, { rootNodes });
    expect(fp.semantic.child_shape).toEqual(['span', 'button']);
    expect(fp.fingerprint).toContain('child_shape=span-button');
  });

  it('separates two structurally-identical wrappers around different content', () => {
    const { hits, rootNodes } = findAll(
      `<section>
         <div class="row"><button>A</button></div>
         <div class="row"><input type="text"></div>
       </section>`,
      'div'
    );
    const a = generateFingerprint(hits[0]!, { rootNodes });
    const b = generateFingerprint(hits[1]!, { rootNodes });
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.semantic.child_shape).toEqual(['button']);
    expect(b.semantic.child_shape).toEqual(['input']);
  });

  it('preserves child order (icon-then-label vs label-then-icon)', () => {
    const { hits, rootNodes } = findAll(
      `<section>
         <button class="btn"><i class="ic"></i><span>x</span></button>
         <button class="btn"><span>x</span><i class="ic"></i></button>
       </section>`,
      'button'
    );
    const a = generateFingerprint(hits[0]!, { rootNodes });
    const b = generateFingerprint(hits[1]!, { rootNodes });
    expect(a.semantic.child_shape).toEqual(['i', 'span']);
    expect(b.semantic.child_shape).toEqual(['span', 'i']);
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });

  it('only fills the {key} slot when no higher-priority semantic field exists', () => {
    // div with formcontrolname → formcontrolname wins, not child_shape
    const withFcn = findAll(
      `<div formcontrolname="x"><span></span><button></button></div>`,
      'div'
    );
    const fp1 = generateFingerprint(withFcn.hits[0]!, { rootNodes: withFcn.rootNodes });
    expect(fp1.primaryKey).toBe('formcontrolname');

    // bare div → child_shape becomes primary key
    const bare = findAll(`<div><span></span><button></button></div>`, 'div');
    const fp2 = generateFingerprint(bare.hits[0]!, { rootNodes: bare.rootNodes });
    expect(fp2.primaryKey).toBe('child_shape');
    expect(fp2.primaryValue).toBe('span-button');
  });
});

describe('html_id fingerprint field', () => {
  it('is included in the fingerprint string when present', () => {
    const { hits, rootNodes } = findAll(
      `<custom-dropdown id="cust-dd"></custom-dropdown>`,
      'custom-dropdown'
    );
    const fp = generateFingerprint(hits[0]!, { rootNodes });
    expect(fp.semantic.html_id).toBe('cust-dd');
    expect(fp.fingerprint).toContain('html_id=cust-dd');
  });

  it('does not outrank meaningful semantic fields like aria-label', () => {
    const { hits, rootNodes } = findAll(
      `<button id="b1" aria-label="Speichern">x</button>`,
      'button'
    );
    const fp = generateFingerprint(hits[0]!, { rootNodes });
    expect(fp.primaryKey).toBe('aria-label');
    expect(fp.primaryValue).toBe('Speichern');
  });

  it('becomes primary key when nothing else is available', () => {
    const { hits, rootNodes } = findAll(
      `<div id="footer-divider"></div>`,
      'div'
    );
    const fp = generateFingerprint(hits[0]!, { rootNodes });
    expect(fp.primaryKey).toBe('html_id');
    expect(fp.primaryValue).toBe('footer-divider');
  });

  it('separates two otherwise-identical empty divs by their html_id', () => {
    const { hits, rootNodes } = findAll(
      `<section><div id="a"></div><div id="b"></div></section>`,
      'div'
    );
    const a = generateFingerprint(hits[0]!, { rootNodes });
    const b = generateFingerprint(hits[1]!, { rootNodes });
    expect(a.fingerprint).not.toBe(b.fingerprint);
  });
});

describe('includeUtilityClasses snapshot option', () => {
  it('skips Tailwind-shaped tokens when picking the css_class primary key by default', () => {
    const { hits, rootNodes } = findAll(
      `<div class="mt-4 card-error"></div>`,
      'div'
    );
    const fp = generateFingerprint(hits[0]!, { rootNodes });
    expect(fp.primaryKey).toBe('css_class');
    expect(fp.primaryValue).toBe('card-error');
  });

  it('lets utility-shaped tokens win when includeUtilityClasses is true', () => {
    const { hits, rootNodes } = findAll(
      `<div class="mt-4 card-error"></div>`,
      'div'
    );
    const fp = generateFingerprint(hits[0]!, { rootNodes, includeUtilityClasses: true });
    expect(fp.primaryKey).toBe('css_class');
    // first class in sorted order, regardless of utility shape
    expect(fp.primaryValue).toBe('card-error');
  });
});
