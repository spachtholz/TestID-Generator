import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Pipeline } from './helpers/pipeline-harness.js';

describe('PrimeNG dropdown / button / table identity', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-primeng-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('three p-dropdowns with distinct formControlNames get unique variables', async () => {
    const release = await pipeline.release({
      templates: {
        'order.component.html': `
          <p-dropdown formControlName="customer" [options]="customers" placeholder="Kunde wählen"></p-dropdown>
          <p-dropdown formControlName="payment" [options]="paymentMethods" placeholder="Zahlart wählen"></p-dropdown>
          <p-dropdown formControlName="shipping" [options]="shippingMethods" placeholder="Versand wählen"></p-dropdown>
        `
      }
    });
    expect(release.variableMap.size).toBe(3);
    const variables = [...release.variableMap.keys()].sort();
    expect(variables.some((v) => /customer/i.test(v))).toBe(true);
    expect(variables.some((v) => /payment/i.test(v))).toBe(true);
    expect(variables.some((v) => /shipping/i.test(v))).toBe(true);
  });

  it('three p-button with same label "Speichern" but different click handlers disambiguate', async () => {
    const release = await pipeline.release({
      templates: {
        'order.component.html': `
          <p-button label="Speichern" (onClick)="saveAddress()"></p-button>
          <p-button label="Speichern" (onClick)="saveBilling()"></p-button>
          <p-button label="Speichern" (onClick)="saveShipping()"></p-button>
        `
      }
    });
    expect(release.variableMap.size).toBe(3);
    const variables = [...release.variableMap.keys()];
    expect(new Set(variables).size).toBe(3);
    expect(variables.some((v) => /address/i.test(v))).toBe(true);
    expect(variables.some((v) => /billing/i.test(v))).toBe(true);
    expect(variables.some((v) => /shipping/i.test(v))).toBe(true);
  });

  it('p-table with similar columns gets stable header/row testids', async () => {
    const release = await pipeline.release({
      templates: {
        'order.component.html': `
          <p-table [value]="orders">
            <ng-template pTemplate="header">
              <tr>
                <th>Auftragsnr.</th>
                <th>Kunde</th>
                <th>Betrag</th>
              </tr>
            </ng-template>
            <ng-template pTemplate="body" let-order>
              <tr>
                <td>{{order.id}}</td>
                <td>{{order.customer}}</td>
                <td>{{order.total}}</td>
              </tr>
            </ng-template>
          </p-table>
        `
      }
    });
    const variables = [...release.variableMap.keys()];
    expect(new Set(variables).size).toBe(variables.length);
    expect(variables.length).toBeGreaterThanOrEqual(4);
  });

  it('multiple cards differing only by inner content get compact child_shape suffixes', async () => {
    const release = await pipeline.release({
      templates: {
        'order.component.html': `
          <div class="card">
            <h3>Lieferadresse</h3>
            <p>Hauptstr. 12</p>
          </div>
          <div class="card">
            <h3>Rechnungsadresse</h3>
            <p>Bahnhofstr. 5</p>
          </div>
          <div class="card">
            <h3>Versandart</h3>
            <span>Express</span>
          </div>
        `
      }
    });
    const cardVars = [...release.variableMap.keys()].filter((v) => /card/i.test(v));
    expect(new Set(cardVars).size).toBe(cardVars.length);
    expect(cardVars.length).toBeGreaterThanOrEqual(3);
  });
});

describe('lockNames with PrimeNG: variables survive cosmetic edits', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-primeng-lock-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('p-dropdown styleClass changes: locator unchanged', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<p-dropdown formControlName="customer" placeholder="Kunde wählen"></p-dropdown>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<p-dropdown formControlName="customer" placeholder="Kunde wählen" styleClass="my-custom"></p-dropdown>'
      }
    });
    expect(r2.variableMap.size).toBe(1);
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('p-button onClick handler renamed but label kept: rename detection saves the locator', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html':
          '<p-button label="Speichern" (onClick)="onSave()"></p-button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html':
          '<p-button label="Speichern" (onClick)="handleSave()"></p-button>'
      }
    });
    expect(r2.variableMap.size).toBe(1);
    expect([...r2.variableMap.keys()][0]).toBe(v1);
  });

  it('card wrapper gets a new sibling: existing card variable stays', async () => {
    const r1 = await pipeline.release({
      templates: {
        'order.component.html': `
          <div class="card">
            <h3>Lieferadresse</h3>
            <p>Hauptstr. 12</p>
          </div>
        `
      }
    });
    const cardVar1 = Pipeline.variableMatching(r1, (testid) =>
      /div--card/i.test(testid) || /domDiv_card/i.test(testid)
    );
    expect(cardVar1).not.toBeNull();
    const sizeBefore = r1.variableMap.size;

    const r2 = await pipeline.release({
      templates: {
        'order.component.html': `
          <div class="card">
            <h3>Lieferadresse</h3>
            <p>Hauptstr. 12</p>
          </div>
          <div class="card">
            <h3>Rechnungsadresse</h3>
            <p>Bahnhofstr. 5</p>
          </div>
        `
      }
    });
    expect(r2.variableMap.size).toBeGreaterThan(sizeBefore);
    expect(r2.variableMap.has(cardVar1!)).toBe(true);
  });
});

describe('mixed PrimeNG + native + div: no collisions, no locator drift', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-mix-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('full order form: p-dropdown + native input + p-button + native button + card', async () => {
    const tpl = `
      <div class="card">
        <h3>Bestellung</h3>
        <p-dropdown formControlName="customer" placeholder="Kunde wählen"></p-dropdown>
        <input formControlName="email" placeholder="E-Mail" />
        <input formControlName="phone" placeholder="Telefon" />
      </div>
      <div class="card">
        <h3>Adresse</h3>
        <input formControlName="street" placeholder="Straße" />
        <input formControlName="zip" placeholder="PLZ" />
        <input formControlName="city" placeholder="Stadt" />
      </div>
      <p-button label="Speichern" (onClick)="save()"></p-button>
      <button (click)="cancel()">Abbrechen</button>
    `;
    const r1 = await pipeline.release({ templates: { 'order.component.html': tpl } });
    expect(r1.variableMap.size).toBeGreaterThanOrEqual(11);
    expect(new Set([...r1.variableMap.keys()]).size).toBe(r1.variableMap.size);

    const tpl2 = tpl
      .replace(/<input /g, '<input class="form-control" ')
      .replace(/<button /g, '<button class="btn btn-primary" ');
    const r2 = await pipeline.release({ templates: { 'order.component.html': tpl2 } });
    expect(r2.variableMap.size).toBe(r1.variableMap.size);
    for (const [variable, testid] of r1.variableMap) {
      expect(r2.variableMap.get(variable)).toBe(testid);
    }
  });
});
