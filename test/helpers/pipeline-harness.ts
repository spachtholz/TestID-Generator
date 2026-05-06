// Test harness that simulates the production pipeline for stateless
// tagging: each "release" rewrites the HTML templates from scratch (no
// data-testid attributes carried over), runs the tagger, then runs
// gen-locators against the produced registry. The registry persists
// across releases and is the only carrier of locator-name stability.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { runTagger } from '../../src/tagger/tagger.js';
import { DEFAULT_CONFIG } from '../../src/tagger/config-loader.js';
import { generateLocators } from '../../src/locators/generator.js';
import type { ComponentNamingMode } from '../../src/locators/component-naming.js';
import { loadLatestRegistry } from '../../src/registry/loader.js';
import type { Registry } from '../../src/registry/schema.js';

export interface ReleaseOptions {
  /** Map relative path under `srcDir` -> raw HTML body (no data-testid). */
  templates: Record<string, string>;
  /** Component-naming mode for gen-locators. Default: disambiguate. */
  componentNaming?: ComponentNamingMode;
  /** Locator selector engine. Default: css. */
  selectorEngine?: 'xpath' | 'css';
}

export interface ReleaseResult {
  registry: Registry;
  locatorFiles: Record<string, string>;
  /** Map of variable name -> testid for fast assertions. */
  variableMap: Map<string, string>;
  /** Map of testid -> variable name. */
  testidByVariable: Map<string, string>;
}

export class Pipeline {
  private workDir: string;
  private srcDir: string;
  private registryDir: string;
  private outDir: string;

  constructor(workDir: string) {
    this.workDir = workDir;
    this.srcDir = path.join(workDir, 'src');
    this.registryDir = path.join(workDir, 'test-artifacts', 'testids');
    this.outDir = path.join(workDir, 'tests', 'locators');
  }

  /** Wipe the templates directory so a release starts from a clean slate
   *  (production behaviour: HTML never contains data-testid attributes
   *  in git, the tagger injects them per build). */
  private async resetTemplates(): Promise<void> {
    try {
      await fs.rm(this.srcDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    await fs.mkdir(this.srcDir, { recursive: true });
  }

  async release(options: ReleaseOptions): Promise<ReleaseResult> {
    await this.resetTemplates();
    for (const [rel, body] of Object.entries(options.templates)) {
      const full = path.join(this.srcDir, rel);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, body, 'utf8');
    }

    const config = {
      ...DEFAULT_CONFIG,
      testConfigurationOnly: false,
      rootDir: 'src',
      writeBackups: false,
      // Monorepo-safe by default: two `dialog.component.html` in different
      // app folders would otherwise collapse onto the same component slug
      // and write a single registry entry that silently shadows one of
      // them. `disambiguate` prefixes path segments on basename collision.
      componentNaming: (options.componentNaming ?? 'disambiguate') as
        'basename' | 'basename-strict' | 'disambiguate'
    };
    await runTagger(config, { cwd: this.workDir });

    const registry = await loadLatestRegistry(this.registryDir);
    if (!registry) throw new Error('Tagger produced no registry');

    const result = await generateLocators(registry, {
      outDir: this.outDir,
      registryPath: path.join(this.registryDir, 'testids.latest.json'),
      lockNames: true,
      mode: 'overwrite',
      componentNaming: options.componentNaming ?? 'disambiguate',
      selectorEngine: options.selectorEngine ?? 'css'
    });

    const locatorFiles: Record<string, string> = {};
    for (const p of result.writtenPaths) {
      locatorFiles[path.basename(p)] = await fs.readFile(p, 'utf8');
    }

    const variableMap = new Map<string, string>();
    const testidByVariable = new Map<string, string>();
    const lineRe = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"[^"]*\[(?:@)?[\w-]+='([^']+)'\][^"]*"\s*#\s*testid-managed/gm;
    for (const py of Object.values(locatorFiles)) {
      let m;
      const re = new RegExp(lineRe);
      while ((m = re.exec(py)) !== null) {
        variableMap.set(m[1]!, m[2]!);
        testidByVariable.set(m[2]!, m[1]!);
      }
    }

    // Re-load the registry once gen-locators wrote the locked names back.
    const registryAfter = await loadLatestRegistry(this.registryDir);

    return {
      registry: registryAfter ?? registry,
      locatorFiles,
      variableMap,
      testidByVariable
    };
  }

  /** Find the variable name attached to a managed line whose XPath/CSS
   *  selector targets `testid`. Returns null when not present. */
  static variableForTestid(release: ReleaseResult, testid: string): string | null {
    return release.testidByVariable.get(testid) ?? null;
  }

  /** Find the variable name attached to a managed line whose attribute
   *  selector matches the substring. Useful when the testid hash changes
   *  but the testid prefix (component, element type, primary key) is stable. */
  static variableMatching(
    release: ReleaseResult,
    predicate: (testid: string, variable: string) => boolean
  ): string | null {
    for (const [variable, testid] of release.variableMap) {
      if (predicate(testid, variable)) return variable;
    }
    return null;
  }

  /** Find every variable whose testid starts with `prefix`. */
  static variablesByTestidPrefix(
    release: ReleaseResult,
    prefix: string
  ): { variable: string; testid: string }[] {
    const out: { variable: string; testid: string }[] = [];
    for (const [variable, testid] of release.variableMap) {
      if (testid.startsWith(prefix)) out.push({ variable, testid });
    }
    return out.sort((a, b) => a.variable.localeCompare(b.variable));
  }
}
