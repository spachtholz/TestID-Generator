// Robot-Framework locator generator: registry in, one .py per component out.
// TODO: ontology-aware locator mode (skip purely-structural testids)

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Registry } from '../registry/index.js';
import { serializeRegistry } from '../registry/index.js';
import {
  buildLocatorEntry,
  DEFAULT_VARIABLE_FORMAT,
  filenameForComponent,
  renderLocatorModule,
  renderVariableName
} from './render.js';
import { mergeLocatorModule } from './merge.js';
import type {
  GenerateLocatorsOptions,
  GenerateLocatorsResult,
  LocatorEntry,
  LocatorModule
} from './types.js';

// mode wins > legacy overwrite > default merge
function resolveMode(
  options: GenerateLocatorsOptions
): 'merge' | 'overwrite' | 'refuse' {
  if (options.mode) return options.mode;
  if (options.overwrite === true) return 'overwrite';
  if (options.overwrite === false) return 'refuse';
  return 'merge';
}

export async function generateLocators(
  registry: Registry,
  options: GenerateLocatorsOptions
): Promise<GenerateLocatorsResult> {
  const attributeName = options.attributeName ?? 'data-testid';
  const xpathPrefix = options.xpathPrefix ?? 'xpath:';
  const variableFormat = options.variableFormat ?? DEFAULT_VARIABLE_FORMAT;
  const mode = resolveMode(options);
  const lockNames = options.lockNames === true;
  const regenerateNames = options.regenerateNames === true;

  // When lockNames is on we may mutate entry.locator_name so future runs can
  // reuse the frozen value. Track whether anything changed to decide if we
  // need to rewrite the registry file.
  const registryMutated = lockNames
    ? reconcileLocatorNames(registry, variableFormat, regenerateNames)
    : false;

  const modules = buildModules(registry, attributeName, xpathPrefix, variableFormat, lockNames);

  await fs.mkdir(options.outDir, { recursive: true });
  const writtenPaths: string[] = [];
  for (const mod of modules) {
    const target = path.join(options.outDir, mod.filename);
    await writeModule({ target, mod, mode, attributeName });
    writtenPaths.push(target);
  }

  if (registryMutated && options.registryPath) {
    await fs.writeFile(options.registryPath, serializeRegistry(registry), 'utf8');
  }

  return { modules, writtenPaths, registryWritten: registryMutated && !!options.registryPath };
}

/**
 * Walk the registry and ensure every entry has a `locator_name`. Returns true
 * if any entry was added/updated so the caller knows to flush the registry.
 */
function reconcileLocatorNames(
  registry: Registry,
  variableFormat: string,
  regenerate: boolean
): boolean {
  let changed = false;
  for (const [testid, entry] of Object.entries(registry.entries)) {
    const expected = renderVariableName(entry, testid, variableFormat);
    if (regenerate) {
      if (entry.locator_name !== expected) {
        entry.locator_name = expected;
        changed = true;
      }
      continue;
    }
    if (entry.locator_name === undefined) {
      entry.locator_name = expected;
      changed = true;
    }
  }
  return changed;
}

async function writeModule(args: {
  target: string;
  mod: LocatorModule;
  mode: 'merge' | 'overwrite' | 'refuse';
  attributeName: string;
}): Promise<void> {
  const { target, mod, mode, attributeName } = args;

  if (mode === 'refuse') {
    // 'wx' = exclusive create, atomic existence check
    try {
      await fs.writeFile(target, renderLocatorModule(mod), { encoding: 'utf8', flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error(
          `Refusing to overwrite existing file ${target} (pass mode: 'merge' or 'overwrite' to proceed)`
        );
      }
      throw err;
    }
    return;
  }

  if (mode === 'overwrite') {
    await fs.writeFile(target, renderLocatorModule(mod), { encoding: 'utf8', flag: 'w' });
    return;
  }

  // merge: read existing file and splice managed lines; missing file => fresh write
  let existing: string | null;
  try {
    existing = await fs.readFile(target, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    existing = null;
  }
  const output =
    existing === null
      ? renderLocatorModule(mod)
      : mergeLocatorModule({ existingSource: existing, freshModule: mod, attributeName });
  await fs.writeFile(target, output, { encoding: 'utf8', flag: 'w' });
}

function buildModules(
  registry: Registry,
  attributeName: string,
  xpathPrefix: string,
  variableFormat: string,
  lockNames: boolean
): LocatorModule[] {
  const byComponent = new Map<string, LocatorEntry[]>();
  for (const [testid, entry] of Object.entries(registry.entries)) {
    const component = componentNameFromPath(entry.component);
    const locator = buildLocatorEntry(testid, {
      attributeName,
      xpathPrefix,
      variableFormat,
      entry,
      frozenName: lockNames ? entry.locator_name : undefined
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

function componentNameFromPath(componentPath: string): string {
  const base = componentPath.split(/[\\/]/).pop() ?? componentPath;
  return base
    .replace(/\.component\.html$/i, '')
    .replace(/\.template\.html$/i, '')
    .replace(/\.html$/i, '');
}
