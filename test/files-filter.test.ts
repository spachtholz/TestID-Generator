import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { runTagger } from '../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../src/tagger/config-loader.js';

const config = { ...DEFAULT_CONFIG, testConfigurationOnly: false, rootDir: 'src' };

let workDir = '';

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'testid-files-'));
  await fs.mkdir(path.join(workDir, 'src/app'), { recursive: true });
  await fs.writeFile(
    path.join(workDir, 'src/app/order-list.component.html'),
    `<button>List</button>`
  );
  await fs.writeFile(
    path.join(workDir, 'src/app/login.component.html'),
    `<button>Login</button>`
  );
});

afterEach(async () => {
  await fs.rm(workDir, { recursive: true, force: true });
});

describe('runTagger — files option', () => {
  it('without --files, tags every template matched by config.include', async () => {
    const result = await runTagger(config, { cwd: workDir });
    expect(result.filesTagged).toBe(2);
  });

  it('with --files, restricts the run to the given path', async () => {
    const result = await runTagger(config, {
      cwd: workDir,
      files: ['src/app/login.component.html']
    });
    expect(result.filesTagged).toBe(1);
    // The login template should be modified, order-list should stay untouched.
    const login = await fs.readFile(path.join(workDir, 'src/app/login.component.html'), 'utf8');
    const orderList = await fs.readFile(path.join(workDir, 'src/app/order-list.component.html'), 'utf8');
    expect(login).toContain('data-testid=');
    expect(orderList).not.toContain('data-testid=');
  });

  it('accepts glob patterns', async () => {
    const result = await runTagger(config, {
      cwd: workDir,
      files: ['src/app/login.*.html']
    });
    expect(result.filesTagged).toBe(1);
  });
});
