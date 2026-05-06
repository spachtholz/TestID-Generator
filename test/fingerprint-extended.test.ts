// Coverage for the extended fingerprint extractors: static attributes,
// bound-input identifiers, event-handler names, i18n keys, interpolation
// property paths, CSS classes, structural directives, and surrounding-
// context anchors.

import { describe, it, expect } from 'vitest';
import {
  parseAngularTemplate,
  walkElements,
  isElement,
  type VisitedElement
} from '../src/tagger/template-parser.js';
import { generateFingerprint } from '../src/tagger/fingerprint-generator.js';

interface ElementHit {
  element: VisitedElement;
  parents: readonly VisitedElement[];
}

function findAll(source: string, tagName: string): {
  hits: ElementHit[];
  rootNodes: ReturnType<typeof parseAngularTemplate>['ast'];
} {
  const parsed = parseAngularTemplate(source);
  const hits: ElementHit[] = [];
  walkElements(parsed.ast, (el, _loop, parents) => {
    if (isElement(el) && (el as { name?: string }).name === tagName) {
      hits.push({ element: el, parents });
    }
  });
  return { hits, rootNodes: parsed.ast };
}

function fpFor(hit: ElementHit, rootNodes: readonly unknown[]) {
  return generateFingerprint(hit.element, {
    parents: hit.parents,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rootNodes: rootNodes as any
  });
}

describe('extended static attributes', () => {
  it('uses `title` to disambiguate two icon buttons', () => {
    const { hits, rootNodes } = findAll(
      `<button title="Bestellung speichern" icon="save"></button>
       <button title="Bestellung verwerfen" icon="x"></button>`,
      'button'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.primaryKey).toBe('title');
    expect(a.primaryValue).toBe('Bestellung speichern');
  });

  it('captures arbitrary custom-element inputs as static_attributes', () => {
    const { hits, rootNodes } = findAll(
      `<p-tag severity="success" variant="solid">A</p-tag>
       <p-tag severity="warn" variant="outline">P</p-tag>`,
      'p-tag'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.semantic.static_attributes).toMatchObject({
      severity: 'success',
      variant: 'solid'
    });
  });

  it('promotes `value` and `title` to dedicated scalar fields', () => {
    const { hits, rootNodes } = findAll(
      `<p-tag value="active" title="Active record">A</p-tag>`,
      'p-tag'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.semantic.value).toBe('active');
    expect(a.semantic.title).toBe('Active record');
    // value/title are scalars, not catch-alls
    expect(a.semantic.static_attributes.value).toBeUndefined();
    expect(a.semantic.static_attributes.title).toBeUndefined();
  });
});

describe('bound-input identifiers', () => {
  it('disambiguates `<my-card [data]="currentOrder">` vs `[data]="archivedOrder"`', () => {
    const { hits, rootNodes } = findAll(
      `<my-card [data]="currentOrder"></my-card>
       <my-card [data]="archivedOrder"></my-card>`,
      'my-card'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.semantic.bound_identifiers).toEqual({ data: 'currentOrder' });
  });

  it('extracts dotted paths', () => {
    const { hits, rootNodes } = findAll(
      `<my-card [data]="form.controls.customer"></my-card>`,
      'my-card'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.semantic.bound_identifiers).toEqual({ data: 'form.controls.customer' });
  });

  it('skips function calls and complex expressions', () => {
    const { hits, rootNodes } = findAll(
      `<my-card [data]="getCustomer()"></my-card>`,
      'my-card'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.semantic.bound_identifiers).toEqual({});
  });
});

describe('event handler function names', () => {
  it('uses `(click)="saveOrder()"` as the primary key', () => {
    const { hits, rootNodes } = findAll(
      `<my-icon-button (click)="saveOrder()"></my-icon-button>
       <my-icon-button (click)="cancelOrder()"></my-icon-button>`,
      'my-icon-button'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.primaryKey).toBe('event.click');
    expect(a.primaryValue).toBe('saveOrder');
    expect(b.primaryValue).toBe('cancelOrder');
  });

  it('extracts the function even when an argument is passed', () => {
    const { hits, rootNodes } = findAll(
      `<my-icon-button (click)="onSubmit($event)"></my-icon-button>`,
      'my-icon-button'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryValue).toBe('onSubmit');
  });
});

describe('i18n keys + bound-text paths', () => {
  it('extracts `{{ "key" | translate }}` as i18n key', () => {
    const { hits, rootNodes } = findAll(
      `<button>{{ 'order.save' | translate }}</button>
       <button>{{ 'order.cancel' | translate }}</button>`,
      'button'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.primaryKey).toBe('i18n_key');
    expect(a.primaryValue).toBe('order.save');
    expect(b.primaryValue).toBe('order.cancel');
  });

  it('extracts dotted property paths from interpolations (table cells)', () => {
    const { hits, rootNodes } = findAll(
      `<td>{{ order.id }}</td>
       <td>{{ order.customer.name }}</td>
       <td>{{ order.total }}</td>`,
      'td'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    const c = fpFor(hits[2]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.fingerprint).not.toBe(c.fingerprint);
    expect(b.fingerprint).not.toBe(c.fingerprint);
    expect(a.primaryKey).toBe('bound_text_path');
    expect(a.primaryValue).toBe('order.id');
    expect(b.primaryValue).toBe('order.customer.name');
  });

  it('looks through unknown pipes when extracting paths', () => {
    const { hits, rootNodes } = findAll(
      `<td>{{ order.total | currency }}</td>`,
      'td'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryValue).toBe('order.total');
  });
});

describe('CSS classes as last-resort distinguisher', () => {
  it('disambiguates two bare divs with different classes', () => {
    const { hits, rootNodes } = findAll(
      `<div class="form-row"></div>
       <div class="form-header"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.semantic.css_classes).toEqual(['form-row']);
    expect(b.semantic.css_classes).toEqual(['form-header']);
  });

  it('sorts and dedupes class tokens', () => {
    const { hits, rootNodes } = findAll(
      `<div class="zebra alpha alpha bravo"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.semantic.css_classes).toEqual(['alpha', 'bravo', 'zebra']);
  });

  it('prefers a non-utility class as the primary key', () => {
    const { hits, rootNodes } = findAll(
      `<div class="mt-4 flex card-header text-sm"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryKey).toBe('css_class');
    expect(a.primaryValue).toBe('card-header');
  });

  it('still uses class as fallback when only utilities are present', () => {
    const { hits, rootNodes } = findAll(
      `<div class="mt-4 p-2 flex"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryKey).toBe('css_class');
    // alphabetically first of the utility classes
    expect(a.primaryValue).toBe('flex');
  });

  it('semantic attributes still beat classes', () => {
    const { hits, rootNodes } = findAll(
      `<input formcontrolname="email" class="error" />`,
      'input'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryKey).toBe('formcontrolname');
    expect(a.primaryValue).toBe('email');
  });
});

describe('structural directives on parent <ng-template>', () => {
  it('disambiguates `<div *ngIf="A">` and `<div *ngIf="B">`', () => {
    const { hits, rootNodes } = findAll(
      `<div *ngIf="isAdmin"></div>
       <div *ngIf="isUser"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.semantic.structural_directives).toEqual({ ngif: 'isAdmin' });
    expect(b.semantic.structural_directives).toEqual({ ngif: 'isUser' });
  });

  it('uses the *ngIf condition as primary key when nothing better is around', () => {
    const { hits, rootNodes } = findAll(
      `<div *ngIf="isAdmin"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryKey).toBe('structural_directive');
    expect(a.primaryValue).toBe('isAdmin');
  });

  it('captures *ngFor expression', () => {
    const { hits, rootNodes } = findAll(
      `<div *ngFor="let order of orders"></div>`,
      'div'
    );
    const a = fpFor(hits[0]!, rootNodes);
    // Angular splits *ngFor into a marker `ngFor` (empty) plus the actual
    // collection binding `ngForOf` - we capture the latter.
    expect(a.semantic.structural_directives.ngforof).toBe('orders');
  });

  it('semantic attributes still beat structural directives', () => {
    const { hits, rootNodes } = findAll(
      `<input *ngIf="show" formcontrolname="email" />`,
      'input'
    );
    const a = fpFor(hits[0]!, rootNodes);
    expect(a.primaryKey).toBe('formcontrolname');
  });
});

describe('Surrounding context: reusable components', () => {
  it('uses preceding heading for two identical custom-dropdowns', () => {
    const { hits, rootNodes } = findAll(
      `<div>
         <h3>Kunde</h3>
         <custom-dropdown></custom-dropdown>
         <h3>Produkt</h3>
         <custom-dropdown></custom-dropdown>
       </div>`,
      'custom-dropdown'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.fingerprint).not.toBe(b.fingerprint);
    expect(a.primaryKey).toBe('context.preceding_heading');
    expect(a.primaryValue).toBe('Kunde');
    expect(b.primaryValue).toBe('Produkt');
  });

  it('uses fieldset legend as anchor', () => {
    const { hits, rootNodes } = findAll(
      `<form>
         <fieldset><legend>Auftraggeber</legend><custom-dropdown></custom-dropdown></fieldset>
         <fieldset><legend>Bestellpositionen</legend><custom-dropdown></custom-dropdown></fieldset>
       </form>`,
      'custom-dropdown'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.primaryKey).toBe('context.fieldset_legend');
    expect(a.primaryValue).toBe('Auftraggeber');
    expect(b.primaryValue).toBe('Bestellpositionen');
  });

  it('uses <label for> match for explicit label', () => {
    const { hits, rootNodes } = findAll(
      `<div>
         <label for="cust-dd">Kunde</label>
         <custom-dropdown id="cust-dd"></custom-dropdown>
         <label for="prod-dd">Produkt</label>
         <custom-dropdown id="prod-dd"></custom-dropdown>
       </div>`,
      'custom-dropdown'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.primaryKey).toBe('context.label_for');
    expect(a.primaryValue).toBe('Kunde');
    expect(b.primaryValue).toBe('Produkt');
  });

  it('uses wrapper-component label input', () => {
    const { hits, rootNodes } = findAll(
      `<my-form-field label="Kunde"><custom-dropdown></custom-dropdown></my-form-field>
       <my-form-field label="Produkt"><custom-dropdown></custom-dropdown></my-form-field>`,
      'custom-dropdown'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.primaryKey).toBe('context.wrapper_label');
    expect(a.primaryValue).toBe('Kunde');
    expect(b.primaryValue).toBe('Produkt');
  });

  it('own-element formControlName beats surrounding heading', () => {
    const { hits, rootNodes } = findAll(
      `<div>
         <h3>Eingaben</h3>
         <custom-dropdown formControlName="customer"></custom-dropdown>
         <custom-dropdown formControlName="product"></custom-dropdown>
       </div>`,
      'custom-dropdown'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    expect(a.primaryKey).toBe('formcontrolname');
    expect(a.primaryValue).toBe('customer');
    expect(b.primaryValue).toBe('product');
  });

  it('does not let a section-boundary heading leak into the next form', () => {
    const { hits, rootNodes } = findAll(
      `<div>
         <h2>Auftraggeber</h2>
         <form><custom-dropdown></custom-dropdown></form>
         <form><custom-dropdown></custom-dropdown></form>
       </div>`,
      'custom-dropdown'
    );
    const a = fpFor(hits[0]!, rootNodes);
    const b = fpFor(hits[1]!, rootNodes);
    // Both sit inside a <form> - section boundary stops the upward walk
    // before the page-level heading is reached, so neither inherits it.
    // The two are still indistinguishable, which is the *correct* signal
    // back to the developer that this template needs explicit anchors.
    expect(a.primaryKey).toBeNull();
    expect(b.primaryKey).toBeNull();
  });
});
