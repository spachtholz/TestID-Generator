import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { camelCaseTestid, filenameForComponent, renderLocatorModule } from '../src/locators/render.js';
import { generateLocators } from '../src/locators/generator.js';
import { createEmptyRegistry, type Registry, type RegistryEntry } from '../src/registry/schema.js';

function entry(overrides: Partial<RegistryEntry> & { component: string }): RegistryEntry {
  return {
    component: overrides.component,
    tag: 'div',
    element_type: 'dom_div',
    fingerprint: 'div',
    semantic: {
      formcontrolname: null,
      aria_label: null,
      placeholder: null,
      text_content: null,
      type: null
    },
    first_seen_version: 1,
    last_seen_version: 1,
    ...overrides
  };
}

describe('camelCaseTestid', () => {
  it('treats __ and -- as word boundaries', () => {
    expect(camelCaseTestid('order-list__table--auftragsliste')).toBe(
      'orderListTableAuftragsliste'
    );
  });

  it('handles short ids', () => {
    expect(camelCaseTestid('login')).toBe('login');
  });

  it('preserves digits and prepends tid when the first char is a digit', () => {
    expect(camelCaseTestid('1337-button')).toBe('tid1337Button');
  });

  it('returns a safe default for empty input', () => {
    expect(camelCaseTestid('')).toBe('tid');
  });
});

describe('filenameForComponent', () => {
  it('snake_cases the component name', () => {
    expect(filenameForComponent('order-list')).toBe('order_list.py');
    expect(filenameForComponent('user-settings')).toBe('user_settings.py');
  });
});

describe('renderLocatorModule', () => {
  it('emits camelCase constants with the testid-managed marker', () => {
    const out = renderLocatorModule({
      component: 'order-list',
      filename: 'order_list.py',
      entries: [
        {
          variable: 'orderListThId',
          selector: "xpath://*[@data-testid='order-list__th--id']",
          testid: 'order-list__th--id'
        }
      ]
    });
    expect(out).toContain('# Component: order-list');
    expect(out).toContain(
      `orderListThId = "xpath://*[@data-testid='order-list__th--id']"  # testid-managed`
    );
  });
});

describe('generateLocators', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-gen-loc-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('groups entries by component and writes one .py per component', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'order-list__th--id': entry({ component: 'src/app/order-list/order-list.component.html' }),
        'login__input--email': entry({ component: 'src/app/login/login.component.html' })
      }
    };
    const result = await generateLocators(registry, { outDir: dir });
    expect(result.modules.map((m) => m.component).sort()).toEqual(['login', 'order-list']);
    expect(result.writtenPaths).toHaveLength(2);
    const orderListFile = path.join(dir, 'order_list.py');
    const content = await fs.readFile(orderListFile, 'utf8');
    expect(content).toContain('orderListThId');
    expect(content).toContain("xpath://*[@data-testid='order-list__th--id']");
  });

  it('respects a custom attributeName and xpathPrefix', async () => {
    const registry: Registry = {
      ...createEmptyRegistry(1, '2026-04-17T10:00:00Z'),
      entries: {
        'login__input--email': entry({ component: 'login.component.html' })
      }
    };
    await generateLocators(registry, {
      outDir: dir,
      attributeName: 'data-cy',
      xpathPrefix: ''
    });
    const content = await fs.readFile(path.join(dir, 'login.py'), 'utf8');
    expect(content).toContain(`"//*[@data-cy='login__input--email']"`);
    expect(content).not.toContain('xpath:');
  });
});
