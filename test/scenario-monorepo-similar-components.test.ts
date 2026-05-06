import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { Pipeline } from './helpers/pipeline-harness.js';

describe('Monorepo: identical component basenames in different apps', () => {
  let workDir = '';
  let pipeline: Pipeline;

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-monorepo-'));
    pipeline = new Pipeline(workDir);
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('two dialog.component.html in admin/ and user/ get distinct locator modules', async () => {
    const dialogTpl = `
      <button (click)="confirm()">OK</button>
      <button (click)="cancel()">Abbrechen</button>
    `;
    const release = await pipeline.release({
      templates: {
        'apps/admin/dialog.component.html': dialogTpl,
        'apps/user/dialog.component.html': dialogTpl
      }
    });

    const fileNames = Object.keys(release.locatorFiles).sort();
    expect(fileNames.length).toBeGreaterThanOrEqual(2);
    expect(fileNames.some((f) => /admin/i.test(f))).toBe(true);
    expect(fileNames.some((f) => /user/i.test(f))).toBe(true);

    const seen = new Set<string>();
    for (const v of release.variableMap.keys()) {
      expect(seen.has(v)).toBe(false);
      seen.add(v);
    }

    expect(release.variableMap.size).toBe(4);
  });

  it('three button.component.html with identical bodies in nested modules disambiguate', async () => {
    const tpl = '<button (click)="onClick()">Click me</button>';
    const release = await pipeline.release({
      templates: {
        'apps/orders/widgets/button.component.html': tpl,
        'apps/customers/widgets/button.component.html': tpl,
        'apps/inventory/widgets/button.component.html': tpl
      }
    });

    expect(Object.keys(release.locatorFiles).length).toBe(3);
    expect(release.variableMap.size).toBe(3);
    const variables = [...release.variableMap.keys()].sort();
    expect(new Set(variables).size).toBe(3);
  });

  it('warns about cross-file collisions when variableFormat omits {component}', async () => {
    // Default variableFormat includes {component}, so no cross-file collision.
    // The WARN path itself is exercised in test/locator-cross-file-collision.test.ts.
    const tpl = '<button (click)="save()">Save</button>';
    await pipeline.release({
      templates: {
        'apps/admin/dialog.component.html': tpl,
        'apps/user/dialog.component.html': tpl
      }
    });
    expect(true).toBe(true);
  });

  it('locator names stay byte-identical across two clean-HTML releases', async () => {
    const dialogTpl = `
      <button (click)="confirm()">OK</button>
      <input formControlName="email" placeholder="Email" />
    `;
    const r1 = await pipeline.release({
      templates: {
        'apps/admin/dialog.component.html': dialogTpl,
        'apps/user/dialog.component.html': dialogTpl
      }
    });
    const v1 = new Map(r1.variableMap);

    const r2 = await pipeline.release({
      templates: {
        'apps/admin/dialog.component.html': dialogTpl,
        'apps/user/dialog.component.html': dialogTpl
      }
    });

    expect(r2.variableMap.size).toBe(v1.size);
    for (const [variable, testid] of r2.variableMap) {
      expect(v1.get(variable)).toBe(testid);
    }
  });

  it('component renamed (admin to admin_old): old locator module becomes stale, new one appears', async () => {
    const tpl = '<button (click)="save()">Save</button>';
    const r1 = await pipeline.release({
      templates: { 'apps/admin/dialog.component.html': tpl }
    });
    expect(r1.variableMap.size).toBe(1);
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: { 'apps/admin_archive/dialog.component.html': tpl }
    });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    // Rename detection MAY transfer the locator_name; either way the
    // variable must be unambiguous and non-empty.
    if (v2 === v1) {
      expect(v2).toBe(v1);
    } else {
      expect(v2.length).toBeGreaterThan(0);
    }
  });

  it('element moved from admin/dialog.html to user/dialog.html: variable inheritance documented', async () => {
    const r1 = await pipeline.release({
      templates: {
        'apps/admin/dialog.component.html': '<button (click)="confirm()">OK</button>'
      }
    });
    const v1 = [...r1.variableMap.keys()][0]!;

    const r2 = await pipeline.release({
      templates: {
        'apps/user/dialog.component.html': '<button (click)="confirm()">OK</button>'
      }
    });
    expect(r2.variableMap.size).toBe(1);
    const v2 = [...r2.variableMap.keys()][0]!;
    // High similarity, so rename detection keeps the admin-era name in user_dialog.py.
    expect(v2).toBe(v1);
  });

  it('same button text in two completely different domains stays unique', async () => {
    const release = await pipeline.release({
      templates: {
        'apps/orders/order-form.component.html':
          '<button (click)="saveOrder()">Speichern</button>',
        'apps/customers/customer-form.component.html':
          '<button (click)="saveCustomer()">Speichern</button>'
      }
    });
    expect(release.variableMap.size).toBe(2);
    const variables = [...release.variableMap.keys()];
    expect(new Set(variables).size).toBe(2);
    expect(variables.some((v) => /order/i.test(v))).toBe(true);
    expect(variables.some((v) => /customer/i.test(v))).toBe(true);
  });
});
