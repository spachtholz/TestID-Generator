/**
 * Orchestrator for the Robot Framework locator generator. Reads a registry,
 * groups entries by component, renders one Python module per component, and
 * writes them to disk.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Registry } from '../registry/index.js';
import {
  buildLocatorEntry,
  DEFAULT_VARIABLE_FORMAT,
  filenameForComponent,
  renderLocatorModule
} from './render.js';
import type {
  GenerateLocatorsOptions,
  GenerateLocatorsResult,
  LocatorEntry,
  LocatorModule
} from './types.js';

export async function generateLocators(
  registry: Registry,
  options: GenerateLocatorsOptions
): Promise<GenerateLocatorsResult> {
  const attributeName = options.attributeName ?? 'data-testid';
  const xpathPrefix = options.xpathPrefix ?? 'xpath:';
  const overwrite = options.overwrite ?? true;
  const variableFormat = options.variableFormat ?? DEFAULT_VARIABLE_FORMAT;

  const modules = buildModules(registry, attributeName, xpathPrefix, variableFormat);

  await fs.mkdir(options.outDir, { recursive: true });
  // Use `wx` (write-exclusive) instead of a prior access() probe to keep the
  // existence check atomic with the write — a pre-check would be a classic
  // TOCTOU race if the user runs the generator twice in parallel.
  const writeFlag = overwrite ? 'w' : 'wx';
  const writtenPaths: string[] = [];
  for (const mod of modules) {
    const target = path.join(options.outDir, mod.filename);
    try {
      await fs.writeFile(target, renderLocatorModule(mod), { encoding: 'utf8', flag: writeFlag });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(
          `Refusing to overwrite existing file ${target} (pass overwrite: true to force)`
        );
      }
      throw err;
    }
    writtenPaths.push(target);
  }
  return { modules, writtenPaths };
}

/**
 * Fold every registry entry into its owning component's module. Components are
 * derived from the entry's `component` path: `app/features/order-list/order-list.component.html`
 * contributes to the `order-list` module.
 */
function buildModules(
  registry: Registry,
  attributeName: string,
  xpathPrefix: string,
  variableFormat: string
): LocatorModule[] {
  const byComponent = new Map<string, LocatorEntry[]>();
  for (const [testid, entry] of Object.entries(registry.entries)) {
    const component = componentNameFromPath(entry.component);
    const locator = buildLocatorEntry(testid, {
      attributeName,
      xpathPrefix,
      variableFormat,
      entry
    });
    const list = byComponent.get(component) ?? [];
    list.push(locator);
    byComponent.set(component, list);
  }

  const modules: LocatorModule[] = [];
  for (const [component, entries] of byComponent) {
    entries.sort((a, b) => a.variable.localeCompare(b.variable));
    modules.push({
      component,
      filename: filenameForComponent(component),
      entries
    });
  }
  modules.sort((a, b) => a.component.localeCompare(b.component));
  return modules;
}

/** `a/b/order-list.component.html` → `order-list`. */
function componentNameFromPath(componentPath: string): string {
  const base = componentPath.split(/[\\/]/).pop() ?? componentPath;
  return base
    .replace(/\.component\.html$/i, '')
    .replace(/\.template\.html$/i, '')
    .replace(/\.html$/i, '');
}
