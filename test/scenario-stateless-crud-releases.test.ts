import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Pipeline } from './helpers/pipeline-harness.js';

describe('CRUD across releases (stateless tagging)', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-crud-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('deleted element: its variable disappears, others stay', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html': `
          <button (click)="save()">Save</button>
          <button (click)="cancel()">Cancel</button>
          <button (click)="reset()">Reset</button>
        `
      }
    });
    expect(r1.variableMap.size).toBe(3);
    const v1Save = Pipeline.variableMatching(r1, (t) => /save/i.test(t));
    const v1Cancel = Pipeline.variableMatching(r1, (t) => /cancel/i.test(t));
    expect(v1Save).not.toBeNull();
    expect(v1Cancel).not.toBeNull();

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          <button (click)="save()">Save</button>
          <button (click)="cancel()">Cancel</button>
        `
      }
    });
    expect(r2.variableMap.size).toBe(2);
    expect(Pipeline.variableMatching(r2, (t) => /save/i.test(t))).toBe(v1Save);
    expect(Pipeline.variableMatching(r2, (t) => /cancel/i.test(t))).toBe(v1Cancel);
    expect(Pipeline.variableMatching(r2, (t) => /reset/i.test(t))).toBeNull();
  });

  it('deleted element re-added later: original variable name returns', async () => {
    const fullTpl = `
      <button (click)="save()">Save</button>
      <button (click)="cancel()">Cancel</button>
    `;
    const r1 = await pipeline.release({
      templates: { 'order.component.html': fullTpl }
    });
    const v1Save = Pipeline.variableMatching(r1, (t) => /save/i.test(t))!;
    const v1Cancel = Pipeline.variableMatching(r1, (t) => /cancel/i.test(t))!;

    await pipeline.release({
      templates: {
        'order.component.html': '<button (click)="save()">Save</button>'
      }
    });

    // Cancel reclaims its old variable name from history via continueAfterGap.
    const r3 = await pipeline.release({
      templates: { 'order.component.html': fullTpl }
    });
    expect(r3.variableMap.size).toBe(2);
    expect(Pipeline.variableMatching(r3, (t) => /save/i.test(t))).toBe(v1Save);
    expect(Pipeline.variableMatching(r3, (t) => /cancel/i.test(t))).toBe(v1Cancel);
  });

  it('new element added later: existing variables stay, new one is fresh and unique', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="save()">Save</button>'
      }
    });
    const v1Save = Pipeline.variableMatching(r1, (t) => /save/i.test(t))!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          <button (click)="save()">Save</button>
          <button (click)="cancel()">Cancel</button>
        `
      }
    });
    expect(r2.variableMap.size).toBe(2);
    expect(Pipeline.variableMatching(r2, (t) => /save/i.test(t))).toBe(v1Save);
    const v2Cancel = Pipeline.variableMatching(r2, (t) => /cancel/i.test(t));
    expect(v2Cancel).not.toBeNull();
    expect(v2Cancel).not.toBe(v1Save);
  });

  it('button text changed but click handler kept: rename detection transfers locator_name', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="saveOrder()">Save</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="saveOrder()">Speichern</button>'
      }
    });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    expect(v2).toBe(v1);
  });

  it('css class added but everything else unchanged: variable identical', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="save()">Save</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button class="primary lg" (click)="save()">Save</button>'
      }
    });
    expect(r2.variableMap.size).toBe(1);
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('moved element within the same component: variable unchanged', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html': `
          <header>
            <button (click)="save()">Save</button>
          </header>
          <footer>
            <button (click)="cancel()">Cancel</button>
          </footer>
        `
      }
    });
    const v1Save = Pipeline.variableMatching(r1, (t) => /save/i.test(t))!;
    const v1Cancel = Pipeline.variableMatching(r1, (t) => /cancel/i.test(t))!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          <footer>
            <button (click)="cancel()">Cancel</button>
          </footer>
          <header>
            <button (click)="save()">Save</button>
          </header>
        `
      }
    });
    expect(Pipeline.variableMatching(r2, (t) => /save/i.test(t))).toBe(v1Save);
    expect(Pipeline.variableMatching(r2, (t) => /cancel/i.test(t))).toBe(v1Cancel);
  });

  it('element duplicated: existing keeps name, copy gets a discriminator suffix', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<button (click)="saveAddress()">Save</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          <button (click)="saveAddress()">Save</button>
          <button (click)="saveBilling()">Save</button>
        `
      }
    });
    expect(r2.variableMap.size).toBe(2);
    const variables = [...r2.variableMap.keys()].sort();
    expect(variables.includes(v1)).toBe(true);
    const newVar = variables.find((v) => v !== v1)!;
    expect(newVar).toMatch(/billing/i);
  });

  it('list of buttons grows: pre-existing entries keep their suffixes', async () => {
    const buildTpl = (clicks: string[]) =>
      clicks.map((c) => `<button (click)="${c}()">Save</button>`).join('\n      ');

    const r1 = await pipeline.release({
      templates: { 'order.component.html': buildTpl(['saveA', 'saveB']) }
    });
    expect(r1.variableMap.size).toBe(2);
    const v1 = new Map(r1.variableMap);

    const r2 = await pipeline.release({
      templates: { 'order.component.html': buildTpl(['saveA', 'saveB', 'saveC']) }
    });
    expect(r2.variableMap.size).toBe(3);
    for (const [variable, testid] of v1) {
      expect(r2.variableMap.get(variable)).toBe(testid);
    }
    const newVar = [...r2.variableMap.keys()].find((v) => !v1.has(v))!;
    expect(newVar).toBeDefined();
  });

  it('button removed from list: surviving entries keep their suffixes', async () => {
    const buildTpl = (clicks: string[]) =>
      clicks.map((c) => `<button (click)="${c}()">Save</button>`).join('\n      ');

    const r1 = await pipeline.release({
      templates: { 'order.component.html': buildTpl(['saveA', 'saveB', 'saveC']) }
    });
    const survivors = new Map(
      [...r1.variableMap].filter(([v]) => !v.toLowerCase().includes('saveb'))
    );
    expect(survivors.size).toBe(2);

    const r2 = await pipeline.release({
      templates: { 'order.component.html': buildTpl(['saveA', 'saveC']) }
    });
    for (const [variable, testid] of survivors) {
      expect(r2.variableMap.get(variable)).toBe(testid);
    }
    expect(r2.variableMap.size).toBe(2);
  });

  it('element moved to a different component: variable transfers via rename detection', async () => {
    const button =
      '<button formControlName="saveOrder" (click)="onSave()" aria-label="Save the order">Save</button>';

    const r1 = await pipeline.release({
      templates: { 'apps/orders/order-form.component.html': button }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: { 'apps/checkout/checkout-form.component.html': button }
    });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    // Rename detection keeps the original name across the cross-component move.
    // For a hard reset, --regenerate-names.
    expect(v2).toBe(v1);
  });

  it('multiple releases with mixed CRUD: every surviving variable stays byte-identical', async () => {
    const tplV1 = `
      <button formControlName="saveOrder" (click)="save()">Speichern</button>
      <button formControlName="cancelOrder" (click)="cancel()">Abbrechen</button>
      <input formControlName="email" placeholder="Email" />
    `;
    const r1 = await pipeline.release({
      templates: { 'order.component.html': tplV1 }
    });
    const baseline = new Map(r1.variableMap);
    expect(baseline.size).toBe(3);

    const tplV2 = `
      <input formControlName="email" placeholder="Email" />
      <button class="lg primary" formControlName="saveOrder" (click)="save()">Speichern</button>
      <button (click)="reset()">Zurücksetzen</button>
      <button formControlName="cancelOrder" (click)="cancel()">Abbrechen</button>
    `;
    const r2 = await pipeline.release({
      templates: { 'order.component.html': tplV2 }
    });
    expect(r2.variableMap.size).toBe(4);
    for (const [variable, testid] of baseline) {
      expect(r2.variableMap.get(variable)).toBe(testid);
    }

    const tplV3 = `
      <input formControlName="email" placeholder="E-Mail-Adresse" />
      <button class="lg primary" formControlName="saveOrder" (click)="save()">Speichern</button>
      <button formControlName="cancelOrder" (click)="cancel()">Abbrechen</button>
    `;
    const r3 = await pipeline.release({
      templates: { 'order.component.html': tplV3 }
    });
    for (const [variable, testid] of baseline) {
      expect(r3.variableMap.get(variable)).toBe(testid);
    }
    expect(r3.variableMap.size).toBe(3);
  });
});
