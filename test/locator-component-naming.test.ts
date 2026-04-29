import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateLocators } from '../src/locators/generator.js';
import { resolveComponentNames } from '../src/locators/component-naming.js';
import { renderMigrationReport } from '../src/locators/migration-report.js';
import { createEmptyRegistry, type Registry, type RegistryEntry } from '../src/registry/schema.js';

function entry(component: string, overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    component,
    tag: 'button',
    element_type: 'native_button',
    fingerprint: `${component}|button`,
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

describe('resolveComponentNames', () => {
  it('returns the basename for unique paths in any mode', () => {
    const paths = ['src/app/login/login.component.html', 'src/app/orders/orders.component.html'];
    for (const mode of ['basename', 'basename-strict', 'disambiguate'] as const) {
      const { labels, collisions } = resolveComponentNames(paths, mode);
      expect(collisions).toHaveLength(0);
      expect(labels.get(paths[0]!)).toBe('login');
      expect(labels.get(paths[1]!)).toBe('orders');
    }
  });

  it('basename keeps both colliding paths on the shared name (legacy)', () => {
    const paths = [
      'apps/customer-portal/src/app/user-card.component.html',
      'apps/admin-portal/src/app/user-card.component.html'
    ];
    const { labels, collisions } = resolveComponentNames(paths, 'basename');
    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.basename).toBe('user-card');
    expect(labels.get(paths[0]!)).toBe('user-card');
    expect(labels.get(paths[1]!)).toBe('user-card');
  });

  it('basename-strict throws on collision', () => {
    const paths = [
      'apps/customer-portal/src/app/user-card.component.html',
      'apps/admin-portal/src/app/user-card.component.html'
    ];
    expect(() => resolveComponentNames(paths, 'basename-strict')).toThrow(
      /Component-name collision on "user-card"/
    );
  });

  it('disambiguate prepends the differing path segment', () => {
    const paths = [
      'apps/customer-portal/src/app/user-card.component.html',
      'apps/admin-portal/src/app/user-card.component.html'
    ];
    const { labels } = resolveComponentNames(paths, 'disambiguate');
    expect(labels.get(paths[0]!)).toBe('customer-portal-user-card');
    expect(labels.get(paths[1]!)).toBe('admin-portal-user-card');
  });

  it('disambiguate handles 3-way collisions with multiple differing segments', () => {
    const paths = [
      'a/b/c/foo.component.html',
      'a/d/c/foo.component.html',
      'a/d/e/foo.component.html'
    ];
    const { labels } = resolveComponentNames(paths, 'disambiguate');
    const names = paths.map((p) => labels.get(p)!);
    expect(new Set(names).size).toBe(3);
    for (const n of names) expect(n).toMatch(/foo$/);
  });
});

describe('generateLocators componentNaming', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-comp-naming-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const collidingRegistry: Registry = {
    ...createEmptyRegistry(1, '2026-04-29T10:00:00Z'),
    entries: {
      'tid-customer-aaa': entry('apps/customer-portal/src/app/user-card.component.html'),
      'tid-admin-bbb': entry('apps/admin-portal/src/app/user-card.component.html', {
        fingerprint: 'apps/admin/user-card|button',
        semantic: {
          formcontrolname: null,
          aria_label: null,
          placeholder: null,
          text_content: 'Ban',
          type: null
        }
      })
    }
  };

  it('default basename mode preserves backwards compatibility', async () => {
    const result = await generateLocators(collidingRegistry, { outDir: dir, mode: 'overwrite' });
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0]!.component).toBe('user-card');
    expect(result.modules[0]!.filename).toBe('user_card.py');
  });

  it('basename-strict surfaces the collision as an error', async () => {
    await expect(
      generateLocators(collidingRegistry, {
        outDir: dir,
        mode: 'overwrite',
        componentNaming: 'basename-strict'
      })
    ).rejects.toThrow(/Component-name collision/);
  });

  it('disambiguate splits into separate files with disambiguated variable names', async () => {
    const result = await generateLocators(collidingRegistry, {
      outDir: dir,
      mode: 'overwrite',
      componentNaming: 'disambiguate'
    });
    expect(result.modules).toHaveLength(2);
    const filenames = result.modules.map((m) => m.filename).sort();
    expect(filenames).toEqual(['admin_portal_user_card.py', 'customer_portal_user_card.py']);

    const customerFile = await fs.readFile(
      path.join(dir, 'customer_portal_user_card.py'),
      'utf8'
    );
    expect(customerFile).toMatch(/customerPortalUserCard_/);
    expect(customerFile).not.toMatch(/adminPortalUserCard_/);
  });

  it('migration report lists renames + sed snippets when switching to disambiguate', async () => {
    const result = await generateLocators(collidingRegistry, {
      outDir: dir,
      mode: 'overwrite',
      componentNaming: 'disambiguate',
      migrationReport: true
    });
    expect(result.migrationReport).toBeDefined();
    expect(result.migrationReport!.entries).toHaveLength(2);

    const text = renderMigrationReport(result.migrationReport!);
    expect(text).toContain('user_card.py  ->  customer_portal_user_card.py');
    expect(text).toContain('user_card.py  ->  admin_portal_user_card.py');
    expect(text).toContain('Apply with sed');
    expect(text).toMatch(/userCard_\w+\s+->\s+customerPortalUserCard_\w+/);
  });

  it('migration report flags orphan locator files left behind from a prior run', async () => {
    const orphanPath = path.join(dir, 'leftover.py');
    await fs.writeFile(
      orphanPath,
      '# Generated by testid-gen-locators - do not edit.\n# Component: leftover\n',
      'utf8'
    );

    const result = await generateLocators(collidingRegistry, {
      outDir: dir,
      mode: 'overwrite',
      componentNaming: 'disambiguate',
      migrationReport: true
    });
    expect(result.migrationReport!.orphanFiles).toContain(orphanPath);
    expect(renderMigrationReport(result.migrationReport!)).toContain('Orphan locator files');
  });

  it('migration report is empty when nothing has changed', async () => {
    const benign: Registry = {
      ...createEmptyRegistry(1, '2026-04-29T10:00:00Z'),
      entries: {
        'tid-login-aaa': entry('src/app/login/login.component.html')
      }
    };
    const result = await generateLocators(benign, {
      outDir: dir,
      mode: 'overwrite',
      migrationReport: true
    });
    expect(result.migrationReport!.entries).toHaveLength(0);
    expect(renderMigrationReport(result.migrationReport!)).toContain('No migration needed');
  });
});
