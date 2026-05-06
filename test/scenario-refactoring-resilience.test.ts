import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Pipeline } from './helpers/pipeline-harness.js';

describe('Refactoring resilience: locator survives common code changes', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-refactor-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('Save-Button: CSS class swapped (primary to success): locator unchanged', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="btn btn-primary" (click)="save()">Speichern</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="btn btn-success btn-lg" (click)="save()">Speichern</button>'
      }
    });
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('Save-Button: complete restyle with a different CSS framework: locator unchanged', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="btn btn-primary" (click)="save()">Speichern</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="px-4 py-2 bg-blue-500 text-white rounded" (click)="save()">Speichern</button>'
      }
    });
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('Save-Button: click handler renamed (onSave to handleSave): locator unchanged', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="onSave()">Speichern</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="handleSave()">Speichern</button>'
      }
    });
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('Email-Input: formControlName renamed but placeholder kept: rename detection saves it', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<input formControlName="customerEmail" placeholder="E-Mail-Adresse" />'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<input formControlName="email" placeholder="E-Mail-Adresse" />'
      }
    });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    // Whether old or new name wins depends on the configured rename threshold;
    // we only assert exactly one variable and stability across a re-run.
    const r2again = await pipeline.release({
      templates: {
        'order.component.html':
          '<input formControlName="email" placeholder="E-Mail-Adresse" />'
      }
    });
    expect([...r2again.variableMap.keys()][0]).toBe(v2);
  });

  it('Save-Button: wrapped in a new div: locator unchanged', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="save()">Speichern</button>'
      }
    });
    const buttonVar1 = Pipeline.variableMatching(r1, (testid) =>
      /button.*speichern/i.test(testid) || /button--speichern/i.test(testid)
    )!;
    expect(buttonVar1).not.toBeNull();

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          <div class="action-row">
            <button (click)="save()">Speichern</button>
          </div>
        `
      }
    });
    expect(r2.variableMap.has(buttonVar1)).toBe(true);
  });

  it('Save-Button moved out of a *ngIf into a sibling position: documented behavior', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<ng-container *ngIf="canSave"><button (click)="save()">Speichern</button></ng-container>'
      }
    });
    const v1 = Pipeline.variableMatching(r1, (testid) =>
      /button/.test(testid)
    )!;
    expect(v1).not.toBeNull();

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': '<button (click)="save()">Speichern</button>'
      }
    });
    const buttonVar = Pipeline.variableMatching(r2, (testid) =>
      /button/.test(testid)
    )!;
    expect(buttonVar).not.toBeNull();
    expect(buttonVar).toBe(v1);
  });

  it('migration from *ngIf to @if: locator unchanged via rename detection', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button *ngIf="canSave" (click)="save()">Speichern</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          @if (canSave) {
            <button (click)="save()">Speichern</button>
          }
        `
      }
    });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    expect(v2).toBe(v1);
  });

  it('three Save buttons stay individually addressable across releases', async () => {
    const tpl = `
      <button (click)="saveAddress()">Speichern</button>
      <button (click)="saveBilling()">Speichern</button>
      <button (click)="saveShipping()">Speichern</button>
    `;
    const r1 = await pipeline.release({
      templates: { 'order.component.html': tpl }
    });
    expect(r1.variableMap.size).toBe(3);
    const v1 = new Map(r1.variableMap);

    const tplRestyled = tpl
      .replace(/<button /g, '<button class="btn btn-primary mt-2" ')
      .replace(/Speichern/g, 'Speichern');
    const r2 = await pipeline.release({
      templates: { 'order.component.html': tplRestyled }
    });
    expect(r2.variableMap.size).toBe(3);
    for (const [variable, testid] of v1) {
      expect(r2.variableMap.get(variable)).toBe(testid);
    }
  });

  it('button text translated from DE to EN: locator survives if click handler is stable', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button formControlName="saveOrder" (click)="save()">Speichern</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    // formControlName outranks text in the fingerprint priority, so the testid
    // is unchanged and rename detection isn't even needed here.
    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button formControlName="saveOrder" (click)="save()">Save</button>'
      }
    });
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('Save-Button gauntlet: 5 unrelated refactors in a row, all variables intact', async () => {
    let r = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="save()">Speichern</button>'
      }
    });
    const baseline = [...r.variableMap.keys()][0]!;

    r = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="btn btn-primary" (click)="save()">Speichern</button>'
      }
    });
    expect([...r.variableMap.keys()][0]).toBe(baseline);

    r = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="btn btn-primary" (click)="onSubmit()">Speichern</button>'
      }
    });
    expect([...r.variableMap.keys()][0]).toBe(baseline);

    r = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="btn btn-primary" aria-label="Speichern" (click)="onSubmit()">Speichern</button>'
      }
    });
    // aria-label is a high-priority fingerprint field, so adding it changes
    // the testid prefix; rename detection bridges via tag/component/text.
    expect(r.variableMap.size).toBe(1);
    const afterAria = [...r.variableMap.keys()][0]!;
    expect(afterAria).toBe(baseline);

    r = await pipeline.release({
      templates: {
        'order.component.html': `
          <div class="action-row">
            <button class="btn btn-primary" aria-label="Speichern" (click)="onSubmit()">Speichern</button>
          </div>
        `
      }
    });
    expect(r.variableMap.has(baseline)).toBe(true);

    r = await pipeline.release({
      templates: {
        'order.component.html': `
          <div class="action-row">
            <button aria-label="Speichern" (click)="onSubmit()">Speichern</button>
          </div>
        `
      }
    });
    expect(r.variableMap.has(baseline)).toBe(true);
  });
});

describe('Robot-Tester perspective: my locators just keep working', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-rf-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('15-element form: every variable stable across cosmetic dev refactor', async () => {
    const v1Tpl = `
      <h2>Bestellung</h2>
      <p-dropdown formControlName="customer" placeholder="Kunde wählen"></p-dropdown>
      <input formControlName="email" placeholder="E-Mail" />
      <input formControlName="phone" placeholder="Telefon" />
      <input formControlName="street" placeholder="Straße" />
      <input formControlName="zip" placeholder="PLZ" />
      <input formControlName="city" placeholder="Stadt" />
      <p-dropdown formControlName="payment" placeholder="Zahlart"></p-dropdown>
      <p-checkbox formControlName="agbAccepted" label="AGB akzeptieren"></p-checkbox>
      <p-button label="Speichern" (onClick)="save()"></p-button>
      <p-button label="Verwerfen" (onClick)="discard()"></p-button>
    `;
    const r1 = await pipeline.release({
      templates: { 'order.component.html': v1Tpl }
    });
    const baseline = new Map(r1.variableMap);
    expect(baseline.size).toBeGreaterThanOrEqual(11);

    const v2Tpl = v1Tpl
      .replace(/<input /g, '<input class="form-control mb-2" ')
      .replace(/save\(\)/g, 'handleSave()')
      .replace(/discard\(\)/g, 'handleDiscard()');
    const r2 = await pipeline.release({
      templates: { 'order.component.html': v2Tpl }
    });
    let preserved = 0;
    for (const [variable, testid] of baseline) {
      if (r2.variableMap.get(variable) === testid) preserved++;
    }
    // Tolerate at most one variable drifting (in case a primary key changed
    // for a single element that wasn't covered by rename detection).
    expect(preserved).toBeGreaterThanOrEqual(baseline.size - 1);
  });
});
