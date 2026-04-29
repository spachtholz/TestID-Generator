// Robot-Framework locator generator: registry in, one .py per component out.
// TODO: ontology-aware locator mode (skip purely-structural testids)

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Registry, RegistryEntry } from '../registry/index.js';
import { serializeRegistry } from '../registry/index.js';
import {
  buildLocatorEntry,
  componentSlug,
  DEFAULT_VARIABLE_FORMAT,
  filenameForComponent,
  renderLocatorModule,
  renderVariableName
} from './render.js';
import { mergeLocatorModule } from './merge.js';
import { resolveComponentNames, type ComponentNamingMode } from './component-naming.js';
import type {
  GenerateLocatorsOptions,
  GenerateLocatorsResult,
  LocatorEntry,
  LocatorModule,
  MigrationReport,
  MigrationReportEntry
} from './types.js';

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
  const naming: ComponentNamingMode = options.componentNaming ?? 'basename';
  const lockNames = options.lockNames === true;
  const regenerateNames = options.regenerateNames === true;

  const componentPaths = uniqueComponentPaths(registry);
  const { labels } = resolveComponentNames(componentPaths, naming);

  // Frozen names are derived using the resolved (disambiguated) component label,
  // so a later switch to disambiguate doesn't strand a registry full of stale
  // basename-derived locator_name values.
  const registryMutated = lockNames
    ? reconcileLocatorNames(registry, variableFormat, regenerateNames, labels)
    : false;

  const modules = buildModules({
    registry,
    attributeName,
    xpathPrefix,
    variableFormat,
    labels,
    lockNames
  });

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

  const result: GenerateLocatorsResult = {
    modules,
    writtenPaths,
    registryWritten: registryMutated && !!options.registryPath
  };
  if (options.migrationReport) {
    result.migrationReport = await buildMigrationReport({
      registry,
      variableFormat,
      currentLabels: labels,
      modules,
      outDir: options.outDir
    });
  }
  return result;
}

function reconcileLocatorNames(
  registry: Registry,
  variableFormat: string,
  regenerate: boolean,
  labels: Map<string, string>
): boolean {
  let changed = false;
  for (const [testid, entry] of Object.entries(registry.entries)) {
    const componentLabel = labels.get(entry.component);
    const expected = renderVariableName(entry, testid, variableFormat, componentLabel);
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

function buildModules(args: {
  registry: Registry;
  attributeName: string;
  xpathPrefix: string;
  variableFormat: string;
  labels: Map<string, string>;
  lockNames: boolean;
}): LocatorModule[] {
  const { registry, attributeName, xpathPrefix, variableFormat, labels, lockNames } = args;
  const byComponent = new Map<string, LocatorEntry[]>();
  for (const [testid, entry] of Object.entries(registry.entries)) {
    const componentLabel = labels.get(entry.component) ?? componentSlug(entry.component);
    const locator = buildLocatorEntry(testid, {
      attributeName,
      xpathPrefix,
      variableFormat,
      entry,
      componentLabel,
      frozenName: lockNames ? entry.locator_name : undefined
    });
    const list = byComponent.get(componentLabel) ?? [];
    list.push(locator);
    byComponent.set(componentLabel, list);
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

function uniqueComponentPaths(registry: Registry): string[] {
  const set = new Set<string>();
  for (const entry of Object.values(registry.entries)) set.add(entry.component);
  return [...set];
}

async function buildMigrationReport(args: {
  registry: Registry;
  variableFormat: string;
  currentLabels: Map<string, string>;
  modules: LocatorModule[];
  outDir: string;
}): Promise<MigrationReport> {
  const { registry, variableFormat, currentLabels, modules, outDir } = args;

  const baselineLabels = new Map<string, string>();
  for (const componentPath of currentLabels.keys()) {
    baselineLabels.set(componentPath, componentSlug(componentPath));
  }

  const entriesByPath = groupEntriesByComponentPath(registry);
  const reportEntries: MigrationReportEntry[] = [];

  for (const [componentPath, registryEntries] of entriesByPath) {
    const oldLabel = baselineLabels.get(componentPath)!;
    const newLabel = currentLabels.get(componentPath)!;
    if (oldLabel === newLabel) continue;

    const variables: MigrationReportEntry['variables'] = [];
    for (const [testid, entry] of registryEntries) {
      const oldVar = renderVariableName(entry, testid, variableFormat, oldLabel);
      const newVar = renderVariableName(entry, testid, variableFormat, newLabel);
      if (oldVar !== newVar) variables.push({ testid, oldVariable: oldVar, newVariable: newVar });
    }

    reportEntries.push({
      componentPath,
      oldComponent: oldLabel,
      newComponent: newLabel,
      oldFilename: filenameForComponent(oldLabel),
      newFilename: filenameForComponent(newLabel),
      variables
    });
  }

  reportEntries.sort((a, b) => a.componentPath.localeCompare(b.componentPath));

  const orphanFiles = await detectOrphans(outDir, modules);
  return { entries: reportEntries, orphanFiles };
}

function groupEntriesByComponentPath(
  registry: Registry
): Map<string, [string, RegistryEntry][]> {
  const map = new Map<string, [string, RegistryEntry][]>();
  for (const [testid, entry] of Object.entries(registry.entries)) {
    const list = map.get(entry.component) ?? [];
    list.push([testid, entry]);
    map.set(entry.component, list);
  }
  return map;
}

const ORPHAN_MARKER = '# Generated by testid-gen-locators';

async function detectOrphans(outDir: string, modules: LocatorModule[]): Promise<string[]> {
  let dirEntries: string[];
  try {
    dirEntries = await fs.readdir(outDir);
  } catch {
    return [];
  }
  const expected = new Set(modules.map((m) => m.filename));
  const orphans: string[] = [];
  for (const name of dirEntries) {
    if (!name.endsWith('.py') || expected.has(name)) continue;
    const full = path.join(outDir, name);
    try {
      const head = await readFileHead(full, ORPHAN_MARKER.length + 32);
      if (head.includes(ORPHAN_MARKER)) orphans.push(full);
    } catch {
      // unreadable -> skip
    }
  }
  return orphans.sort();
}

async function readFileHead(filePath: string, bytes: number): Promise<string> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally {
    await handle.close();
  }
}
