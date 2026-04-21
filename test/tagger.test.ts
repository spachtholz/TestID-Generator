import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';
import { tagTemplateSource, runTagger } from '../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../src/tagger/config-loader.js';
import { loadLatestRegistry } from '../src/registry/loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function fixture(name: string): Promise<string> {
  return fs.readFile(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('tagTemplateSource', () => {
  it('tags native login-form elements with formcontrolname-driven IDs', async () => {
    const source = await fixture('login-form.component.html');
    const out = tagTemplateSource(source, {
      componentName: 'login-form',
      componentPath: 'login-form.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });

    expect(Object.keys(out.entries)).toContain('login-form__input--email');
    expect(Object.keys(out.entries)).toContain('login-form__input--password');
    // "Sign in" button - FR-1.6 rule 6 (text content)
    expect(Object.keys(out.entries)).toContain('login-form__button--sign-in');
    // Tagged template must contain the injected attribute
    expect(out.tagged).toContain(`data-testid="login-form__input--email"`);
    // Original Angular control-flow must not be mangled
    expect(out.tagged).toContain('@if (errorMessage())');
    expect(out.tagged).toContain('{{ errorMessage() }}');
  });

  it('respects existing data-testid (FR-1.3)', async () => {
    const source = await fixture('user-settings.component.html');
    const out = tagTemplateSource(source, {
      componentName: 'user-settings',
      componentPath: 'user-settings.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });

    // Pre-existing ID must be preserved, never duplicated
    expect(
      (out.tagged.match(/data-testid="user-settings__button--preset-cancel"/g) ?? []).length
    ).toBe(1);
    expect(Object.keys(out.entries)).toContain('user-settings__button--preset-cancel');
  });

  it('emits dynamic_children for PrimeNG dropdown + calendar + multiselect (FR-1.8)', async () => {
    const source = await fixture('order-form.component.html');
    const out = tagTemplateSource(source, {
      componentName: 'order-form',
      componentPath: 'order-form.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });

    const dropdown = out.entries['order-form__dropdown--customer'];
    expect(dropdown?.dynamic_children?.pattern).toContain(".p-select-overlay");
    expect(dropdown?.dynamic_children?.addressing).toEqual(['by_index', 'by_text', 'by_value']);

    const calendar = out.entries['order-form__calendar--date'];
    expect(calendar?.dynamic_children?.pattern).toContain('.p-datepicker');
    expect(calendar?.dynamic_children?.addressing).toContain('by_date');
  });

  it('is deterministic: two runs produce the same output (NFR-3)', async () => {
    const source = await fixture('order-form.component.html');
    const a = tagTemplateSource(source, {
      componentName: 'order-form',
      componentPath: 'order-form.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    const b = tagTemplateSource(source, {
      componentName: 'order-form',
      componentPath: 'order-form.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    expect(a.tagged).toBe(b.tagged);
    expect(JSON.stringify(a.entries)).toBe(JSON.stringify(b.entries));
  });

  it('tags layout wrappers and headings under the denylist regime', () => {
    const source = `<section class="page"><h1>Aufträge</h1><div class="toolbar"><span class="hint">Alle</span></div></section>`;
    const out = tagTemplateSource(source, {
      componentName: 'order-list',
      componentPath: 'order-list.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    const ids = Object.keys(out.entries);
    expect(ids.some((id) => id.startsWith('order-list__section--'))).toBe(true);
    expect(ids.some((id) => id.startsWith('order-list__h1--'))).toBe(true);
    expect(ids.some((id) => id.startsWith('order-list__div--'))).toBe(true);
    expect(ids.some((id) => id.startsWith('order-list__span--'))).toBe(true);
  });

  it('skips structural tags from the denylist', () => {
    const source = `<ng-container><ng-template><div>inner</div></ng-template></ng-container>`;
    const out = tagTemplateSource(source, {
      componentName: 'x',
      componentPath: 'x.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    const ids = Object.keys(out.entries);
    // ng-container and ng-template must not appear, but the inner <div> does.
    expect(ids.every((id) => !id.includes('__ng-container--'))).toBe(true);
    expect(ids.every((id) => !id.includes('__ng-template--'))).toBe(true);
    expect(ids.some((id) => id.startsWith('x__div--'))).toBe(true);
  });

  it('leaves elements with a runtime [attr.data-testid] binding alone', () => {
    const source = `<td [attr.data-testid]="'row-' + order.id">{{ order.customer }}</td>`;
    const out = tagTemplateSource(source, {
      componentName: 'order-list',
      componentPath: 'order-list.component.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    // No entries emitted for the <td> (its runtime value is not known at
    // build time); and no new static `data-testid="..."` is inserted.
    expect(Object.keys(out.entries)).toHaveLength(0);
    expect(out.tagged).toBe(source);
  });

  it('marks newly-inserted entries with source="generated"', () => {
    const source = `<button type="submit">Send</button>`;
    const out = tagTemplateSource(source, {
      componentName: 'x',
      componentPath: 'x.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    const [entry] = Object.values(out.entries);
    expect(entry?.source).toBe('generated');
  });

  it('marks pre-existing data-testid entries with source="manual"', () => {
    const source = `<button type="submit" data-testid="my-custom-id">Send</button>`;
    const out = tagTemplateSource(source, {
      componentName: 'x',
      componentPath: 'x.html',
      hashLength: 6,
      config: DEFAULT_CONFIG
    });
    expect(out.entries['my-custom-id']?.source).toBe('manual');
  });
});

describe('runTagger - verbose + override warnings', () => {
  let workDir = '';
  const config = { ...DEFAULT_CONFIG, testConfigurationOnly: false, rootDir: 'src' };

  beforeEach(async () => {
    workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-run-'));
    await fs.mkdir(path.join(workDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(workDir, { recursive: true, force: true });
  });

  it('logs one stderr line per newly-tagged id when verbose', async () => {
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button type="submit">Send</button>`
    );
    const captured: string[] = [];
    await runTagger(config, {
      cwd: workDir,
      verbose: true,
      stderr: (chunk) => captured.push(chunk)
    });
    expect(
      captured.some(
        (line) => line.includes('+ ') && line.includes('hello.component.html') && line.includes('data-testid=')
      )
    ).toBe(true);
  });

  it('emits an override warning when an id flips from generated to manual', async () => {
    // v1: auto-tag a plain button. Tagger assigns an id based on "Send".
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button type="submit">Send</button>`
    );
    await runTagger(config, { cwd: workDir });
    const v1 = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    const autoId = Object.keys(v1!.entries)[0]!;
    expect(v1!.entries[autoId]?.source).toBe('generated');

    // v2: developer adds an aria-label that would make the tagger choose a
    // DIFFERENT id (aria-label is a higher-priority fingerprint source than
    // text content), but they pin the old string by hand. Now the existing
    // id no longer matches what the tagger would produce → source=manual.
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button aria-label="Send order now" data-testid="${autoId}" type="submit">Send</button>`
    );
    const captured: string[] = [];
    await runTagger(config, {
      cwd: workDir,
      stderr: (chunk) => captured.push(chunk)
    });
    const v2 = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    expect(v2!.entries[autoId]?.source).toBe('manual');
    expect(captured.some((line) => line.includes('override:') && line.includes(autoId))).toBe(true);
  });

  it('keeps source=generated when the tagger re-encounters its own id', async () => {
    // After v1, the template will contain the tagger's auto-id. On v2, the
    // tagger must NOT treat its own carried-over id as a manual override -
    // otherwise every second run would raise spurious warnings.
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button type="submit">Send</button>`
    );
    await runTagger(config, { cwd: workDir });
    const captured: string[] = [];
    await runTagger(config, {
      cwd: workDir,
      stderr: (chunk) => captured.push(chunk)
    });
    const v2 = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    const id = Object.keys(v2!.entries)[0]!;
    expect(v2!.entries[id]?.source).toBe('generated');
    expect(captured.every((line) => !line.includes('override:'))).toBe(true);
  });

  it('does not warn when source has always been manual', async () => {
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button data-testid="my-id" type="submit">Send</button>`
    );
    await runTagger(config, { cwd: workDir });
    const captured: string[] = [];
    await runTagger(config, {
      cwd: workDir,
      stderr: (chunk) => captured.push(chunk)
    });
    expect(captured.every((line) => !line.includes('override:'))).toBe(true);
  });

  it('does not re-flag a persistently-manual entry in later activity logs', async () => {
    // v1: auto-tag.
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button type="submit">Send</button>`
    );
    const cfgWithActivity = { ...config, writeActivityLog: true };
    await runTagger(cfgWithActivity, { cwd: workDir });
    const v1 = await loadLatestRegistry(path.join(workDir, 'test-artifacts/testids'));
    const autoId = Object.keys(v1!.entries)[0]!;

    // v2: flip happens - activity log must record exactly one manual-override.
    await fs.writeFile(
      path.join(workDir, 'src', 'hello.component.html'),
      `<button aria-label="Send order now" data-testid="${autoId}" type="submit">Send</button>`
    );
    const v2Result = await runTagger(cfgWithActivity, { cwd: workDir });
    const v2Activity = JSON.parse(await fs.readFile(v2Result.activityJsonPath!, 'utf8'));
    const v2Overrides = v2Activity.records.filter((r: { kind: string }) => r.kind === 'manual-override');
    expect(v2Overrides).toHaveLength(1);
    expect(v2Overrides[0].id).toBe(autoId);

    // v3: no change at all - the entry is still manual but not a *new* flip.
    // The activity log must classify it as carried-over, not manual-override.
    const v3Result = await runTagger(cfgWithActivity, { cwd: workDir });
    const v3Activity = JSON.parse(await fs.readFile(v3Result.activityJsonPath!, 'utf8'));
    const v3Overrides = v3Activity.records.filter((r: { kind: string }) => r.kind === 'manual-override');
    expect(v3Overrides).toHaveLength(0);
    const v3Record = v3Activity.records.find((r: { id: string }) => r.id === autoId);
    expect(v3Record?.kind).toBe('carried-over');
  });
});
