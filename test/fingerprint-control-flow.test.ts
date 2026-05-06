// Angular 17+ control-flow blocks (@if/@else/@switch/@defer/@for) used to
// be invisible to the fingerprint walker. Two structurally identical
// `<button>Save</button>` in different `@if` branches produced byte-equal
// fingerprints - colliding into one testid + a sibling-index suffix that
// shifted on every template edit.
//
// Fix: walkElements now propagates a `blockContext` parameter, and
// getStructuralDirectives folds it into the existing structural_directives
// map. The fingerprint string therefore picks up `struct.@if=cond` tokens
// for every wrapped element.

import { describe, it, expect } from 'vitest';
import {
  parseAngularTemplate,
  walkElements,
  isElement,
  type VisitedElement,
  type BlockContext
} from '../src/tagger/template-parser.js';
import { generateFingerprint } from '../src/tagger/fingerprint-generator.js';

interface VisitedSave {
  el: VisitedElement;
  parents: readonly VisitedElement[];
  blockContext: BlockContext;
}

function findAllByTag(source: string, tagName: string): VisitedSave[] {
  const parsed = parseAngularTemplate(source);
  const out: VisitedSave[] = [];
  walkElements(parsed.ast, (el, _loop, parents, blockContext) => {
    if (isElement(el) && (el as { name?: string }).name === tagName) {
      out.push({ el, parents, blockContext });
    }
  });
  return out;
}

function fp(visited: VisitedSave): string {
  const r = generateFingerprint(visited.el, {
    parents: visited.parents,
    blockContext: visited.blockContext
  });
  return r.fingerprint;
}

describe('fingerprint with @if / @else / @else if branches', () => {
  it('two identical <button>Save</button> in different @if branches get distinct fingerprints', () => {
    const source = `
      @if (showAddress) {
        <button>Save</button>
      } @else if (showBilling) {
        <button>Save</button>
      } @else {
        <button>Save</button>
      }
    `;
    const buttons = findAllByTag(source, 'button');
    expect(buttons).toHaveLength(3);
    const [a, b, c] = buttons;
    const fpA = fp(a!);
    const fpB = fp(b!);
    const fpC = fp(c!);
    expect(fpA).not.toBe(fpB);
    expect(fpB).not.toBe(fpC);
    expect(fpA).not.toBe(fpC);
    // The branch keyword/expression should appear as a struct.* token.
    expect(fpA).toMatch(/struct\.@if=showAddress/);
    expect(fpB).toMatch(/struct\.@else if=showBilling/);
    expect(fpC).toMatch(/struct\.@else=/);
  });

  it('legacy *ngIf still works (regression check)', () => {
    const source = `
      <button *ngIf="isAdmin">Save</button>
      <button *ngIf="isUser">Save</button>
    `;
    const buttons = findAllByTag(source, 'button');
    expect(buttons).toHaveLength(2);
    const fpA = fp(buttons[0]!);
    const fpB = fp(buttons[1]!);
    expect(fpA).not.toBe(fpB);
  });
});

describe('fingerprint with @switch branches', () => {
  it('two <button>Save</button> in different @case branches differ', () => {
    const source = `
      @switch (mode) {
        @case ('edit') {
          <button>Save</button>
        }
        @case ('create') {
          <button>Save</button>
        }
        @default {
          <button>Save</button>
        }
      }
    `;
    const buttons = findAllByTag(source, 'button');
    expect(buttons).toHaveLength(3);
    const fps = buttons.map(fp);
    expect(new Set(fps).size).toBe(3);
    expect(fps[0]).toMatch(/struct\.@switch\.case=mode='edit'/);
    expect(fps[1]).toMatch(/struct\.@switch\.case=mode='create'/);
    expect(fps[2]).toMatch(/struct\.@switch\.default=mode/);
  });
});

describe('fingerprint with @for and @defer', () => {
  it('@for body inherits the iteration expression as block context', () => {
    const source = `
      @for (order of orders; track order.id) {
        <button>Save</button>
      }
      <button>Save</button>
    `;
    const buttons = findAllByTag(source, 'button');
    expect(buttons).toHaveLength(2);
    const fpInsideFor = fp(buttons[0]!);
    const fpOutside = fp(buttons[1]!);
    expect(fpInsideFor).not.toBe(fpOutside);
    expect(fpInsideFor).toMatch(/struct\.@for=/);
    expect(fpOutside).not.toMatch(/struct\.@for=/);
  });

  it('@defer placeholder vs. body branches get distinct context tokens', () => {
    const source = `
      @defer (on viewport) {
        <button>Save</button>
      } @placeholder {
        <button>Save</button>
      }
    `;
    const buttons = findAllByTag(source, 'button');
    expect(buttons).toHaveLength(2);
    const fpA = fp(buttons[0]!);
    const fpB = fp(buttons[1]!);
    expect(fpA).not.toBe(fpB);
    expect(fpA).toMatch(/struct\.@defer=/);
    expect(fpB).toMatch(/struct\.@defer\.placeholder=/);
  });
});

describe('<ng-container *ngIf> wrapper no longer hides the directive', () => {
  it('inner element picks up the *ngIf via the parent walk-up', () => {
    const source = `
      <ng-container *ngIf="cond">
        <button>Save</button>
      </ng-container>
      <button>Save</button>
    `;
    const buttons = findAllByTag(source, 'button');
    expect(buttons).toHaveLength(2);
    const fpInside = fp(buttons[0]!);
    const fpOutside = fp(buttons[1]!);
    // Pre-fix, both produced the same fingerprint because *ngIf only
    // fed off the IMMEDIATE parent (which was <ng-container>). Now we
    // walk the chain and find the synthetic <ng-template> wrapper.
    expect(fpInside).not.toBe(fpOutside);
    expect(fpInside).toMatch(/struct\.ngif=cond/);
  });
});
