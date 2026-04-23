// Main tagger orchestrator (FR-1.x). Discover templates -> parse -> decide
// which elements to tag -> generate IDs -> rewrite -> persist registry.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { glob as globby } from 'tinyglobby';
import {
  createEmptyRegistry,
  detectManualOverrideEvents,
  loadFullHistory,
  loadLatestRegistry,
  mergeEntriesWithHistory,
  resolveRegistryOptions,
  writeRegistry,
  type MergedEntryInfo,
  type Registry,
  type RegistryEntry
} from '../registry/index.js';
import {
  buildActivityReport,
  writeActivityReport
} from './activity-log.js';
import { writeBackup } from '../rollback/backup.js';

import type { TaggerConfig } from './config-loader.js';
import {
  parseAngularTemplate,
  walkElements,
  findAttribute,
  findBoundAttribute,
  getTagName,
  type LoopContext,
  type VisitedElement
} from './template-parser.js';
import { formatLoopWarnings, type LoopWarning } from './loop-warner.js';
import {
  detectElement,
  getDynamicChildrenSpec,
  type DetectedElement
} from './element-detector.js';
import {
  generateFingerprint,
  type Fingerprint
} from './fingerprint-generator.js';
import {
  componentNameFromPath,
  generateId
} from './id-generator.js';

export interface TaggerRunOptions {
  cwd?: string;
  registryDir?: string;
  /** write tagged templates here instead of overwriting source */
  outputDir?: string;
  dryRun?: boolean;
  /** --configuration=test bypasses testConfigurationOnly (FR-1.10) */
  configuration?: string;
  now?: string;
  verbose?: boolean;
  /** injectable for tests */
  stderr?: (chunk: string) => void;
  /** glob/path overrides; replaces config.include for this run */
  files?: readonly string[];
  /**
   * Similarity threshold (0.1..1.0) for rename-aware `locator_name` carry-over
   * in merge. When unset, uses the merge default (0.8). Typically sourced from
   * `locators.renameThreshold` in the unified config.
   */
  locatorRenameThreshold?: number;
}

export interface TaggerRunResult {
  version: number;
  registry: Registry;
  filesTagged: number;
  filesSkipped: number;
  entriesGenerated: number;
  collisions: number;
  loopWarnings: LoopWarning[];
  dryRun: boolean;
  registryPath: string | null;
  latestPath: string | null;
  activityMarkdownPath: string | null;
  activityJsonPath: string | null;
}

export async function runTagger(
  config: TaggerConfig,
  options: TaggerRunOptions = {}
): Promise<TaggerRunResult> {
  const cwd = options.cwd ?? process.cwd();
  const dryRun = options.dryRun ?? false;
  const configuration = options.configuration;
  const now = options.now ?? '1970-01-01T00:00:00Z';
  const verbose = options.verbose ?? false;
  const writeStderr = options.stderr ?? ((chunk: string) => {
    process.stderr.write(chunk);
  });

  if (config.testConfigurationOnly && configuration !== 'test') {
    return emptyResult(dryRun);
  }

  const rootDir = path.resolve(cwd, config.rootDir);
  const ignorePatterns = config.ignore;
  const files = await resolveTemplateFiles({
    cwd,
    rootDir,
    configIncludes: config.include,
    ignorePatterns,
    overrideFiles: options.files
  });

  const registryDir = path.resolve(cwd, options.registryDir ?? config.registryDir);
  const [previous, history] = await Promise.all([
    loadLatestRegistry(registryDir),
    loadFullHistory(registryDir)
  ]);
  const nextVersion = (previous?.version ?? 0) + 1;

  const newEntriesRaw: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>> = {};

  let filesTagged = 0;
  let filesSkipped = 0;
  let collisions = 0;
  const loopWarnings: LoopWarning[] = [];

  const outputDir = options.outputDir
    ? path.resolve(cwd, options.outputDir)
    : null;

  // tag everything in memory first so a partial failure doesn't leave
  // half the templates rewritten
  interface PendingWrite {
    source: string;
    targetPath: string;
    newContent: string;
  }
  const pendingWrites: PendingWrite[] = [];
  for (const file of files) {
    const original = await fs.readFile(file, 'utf8');
    const relFromCwd = path.relative(cwd, file);
    const relFromRoot = path.relative(rootDir, file);
    const result = tagTemplateSource(original, {
      componentName: componentNameFromPath(file),
      componentPath: relFromCwd,
      hashLength: config.hashLength,
      config
    });

    collisions += result.collisions;
    for (const [id, entry] of Object.entries(result.entries)) {
      newEntriesRaw[id] = entry;
    }
    if (config.loopWarnings) {
      for (const w of result.loopWarnings) {
        loopWarnings.push({ ...w, componentPath: relFromCwd.replace(/\\/g, '/') });
      }
    }

    if (result.tagged !== original) {
      filesTagged += 1;
      const outPath = outputDir ? path.join(outputDir, relFromRoot) : file;
      pendingWrites.push({ source: file, targetPath: outPath, newContent: result.tagged });
    } else {
      filesSkipped += 1;
    }
  }

  // pre-run backups, only when writing in-place (not for --output-dir)
  const writeBackups = !dryRun && config.writeBackups !== false && outputDir === null;
  if (writeBackups && pendingWrites.length > 0) {
    await writeBackup({
      registryDir,
      version: nextVersion,
      cwd,
      generatedAt: now,
      sources: pendingWrites.map((w) => w.source)
    });
  }

  if (!dryRun) {
    for (const write of pendingWrites) {
      await fs.mkdir(path.dirname(write.targetPath), { recursive: true });
      await fs.writeFile(write.targetPath, write.newContent, 'utf8');
    }
  }

  const registry = createEmptyRegistry(nextVersion, now);
  registry.build_id = config.build.buildId ?? null;
  registry.app_version = config.build.appVersion ?? null;
  registry.framework_versions = config.build.frameworkVersions ?? {};

  const { merged, dispositions } = mergeEntriesWithHistory({
    previous,
    history,
    newEntries: newEntriesRaw,
    nextVersion,
    now,
    renameThreshold: options.locatorRenameThreshold
  });
  registry.entries = merged;

  if (verbose) {
    logPerEntryActivity(writeStderr, dispositions, config.attributeName);
  }

  // override event = generated -> manual flip; surfaces once per transition
  const overrideEvents = detectManualOverrideEvents(previous, registry.entries);
  const overrideIds = new Set(overrideEvents.map((f) => f.id));
  for (const event of overrideEvents) {
    writeStderr(
      `[testid-tagger] override: ${event.component} ${config.attributeName}="${event.id}" ` +
        `is now manually set (was auto-generated in v${event.previousVersion})\n`
    );
  }

  let registryPath: string | null = null;
  let latestPath: string | null = null;
  let activityMarkdownPath: string | null = null;
  let activityJsonPath: string | null = null;
  if (!dryRun) {
    const write = await writeRegistry(registry, {
      dir: registryDir,
      version: nextVersion,
      retention: config.registryRetention,
      naming: config.registryNaming,
      serializationOptions: resolveRegistryOptions(config.registry)
    });
    registryPath = write.versionedPath;
    latestPath = write.latestPath;

    if (config.writeActivityLog || verbose) {
      const report = buildActivityReport({
        version: nextVersion,
        generatedAt: now,
        dispositions,
        manualOverrideIds: overrideIds
      });
      const activityWrite = await writeActivityReport({ dir: registryDir, report });
      activityMarkdownPath = activityWrite.markdownPath;
      activityJsonPath = activityWrite.jsonPath;
    }
  }

  if (config.loopWarnings && loopWarnings.length > 0) {
    writeStderr(formatLoopWarnings(loopWarnings));
  }

  return {
    version: nextVersion,
    registry,
    filesTagged,
    filesSkipped,
    entriesGenerated: Object.keys(registry.entries).length,
    collisions,
    loopWarnings,
    dryRun,
    registryPath,
    latestPath,
    activityMarkdownPath,
    activityJsonPath
  };
}

/**
 * Resolve the final list of template file paths for a tagger run.
 *
 * When the caller passes explicit `overrideFiles` (the `--files` CLI flag or
 * the programmatic option), those patterns replace `config.include`. Paths
 * starting with `/` or containing a drive letter on Windows are treated as
 * absolute; everything else is joined against `cwd`. This mirrors how most
 * CLI tools expect file-list overrides to behave.
 */
async function resolveTemplateFiles(args: {
  cwd: string;
  rootDir: string;
  configIncludes: readonly string[];
  ignorePatterns: readonly string[];
  overrideFiles: readonly string[] | undefined;
}): Promise<string[]> {
  if (args.overrideFiles && args.overrideFiles.length > 0) { // If --files is set
    const files = await globby([...args.overrideFiles], {
      cwd: args.cwd,
      ignore: [...args.ignorePatterns],
      absolute: true,
      dot: false
    });
    files.sort();
    return files;
  }
  const includes = args.configIncludes.map((p) => p.replace(/^\.\//, ''));
  const files = await globby(includes, {
    cwd: args.rootDir,
    ignore: [...args.ignorePatterns],
    absolute: true,
    dot: false
  });
  files.sort();
  return files;
}

function emptyResult(dryRun: boolean): TaggerRunResult {
  return {
    version: 0,
    registry: createEmptyRegistry(0, '1970-01-01T00:00:00Z'),
    filesTagged: 0,
    filesSkipped: 0,
    entriesGenerated: 0,
    collisions: 0,
    loopWarnings: [],
    dryRun,
    registryPath: null,
    latestPath: null,
    activityMarkdownPath: null,
    activityJsonPath: null
  };
}

/**
 * Emit one stderr line per non-trivial entry disposition. "Carried-over"
 * entries are the boring majority and stay silent; callers reading the stderr
 * stream want the three cases that actually changed something.
 */
function logPerEntryActivity(
  writeStderr: (chunk: string) => void,
  dispositions: Map<string, MergedEntryInfo>,
  attributeName: string
): void {
  const rows = Array.from(dispositions.entries()).sort(([a], [b]) => a.localeCompare(b));
  for (const [id, info] of rows) {
    const prefix = `[testid-tagger] `;
    const attr = `${attributeName}="${id}"`;
    if (info.disposition === 'new') {
      writeStderr(`${prefix}+ ${info.entry.component} ${attr}\n`);
    } else if (info.disposition === 'regenerated') {
      writeStderr(
        `${prefix}~ ${info.entry.component} ${attr} (regenerated - last seen in v${info.previousVersion})\n`
      );
    }
  }
}


/* ---------------------------------------------------------------------- *
 * Per-template tagging
 * ---------------------------------------------------------------------- */

export interface TagTemplateOptions {
  componentName: string;
  componentPath: string;
  hashLength: number;
  config: TaggerConfig;
}

export interface TagTemplateResult {
  tagged: string;
  entries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>>;
  collisions: number;
  loopWarnings: LoopWarning[];
}

interface TagCandidate {
  id: string;
  element: VisitedElement;
  detected: DetectedElement;
  fingerprint: Fingerprint;
  alreadyTagged: boolean;
  existingId: string | null;
  insertionOffset: number;
  source: 'generated' | 'manual';
  loop: LoopContext | null;
}

/**
 * Tag a single template source string. Never touches Angular syntax - we
 * insert `data-testid="…"` exactly after the opening tag name and before
 * any existing attributes (so structural directives and `@if`/`@for` blocks
 * remain verbatim).
 */
export function tagTemplateSource(
  source: string,
  options: TagTemplateOptions
): TagTemplateResult {
  const { config } = options;
  const parsed = parseAngularTemplate(source, { url: options.componentPath });

  const candidates: TagCandidate[] = [];
  walkElements(parsed.ast, (el, loop) => {
    const detected = detectElement(el, config);
    if (!detected) return;

    // Respect a pre-existing runtime binding: the author wrote
    // `[attr.data-testid]="..."` on purpose - e.g. to give every iterator
    // row a unique testid. We must not insert a second static attribute
    // that would fight with the runtime value.
    const boundExisting = findBoundAttribute(el, config.attributeName);
    if (boundExisting) return;

    const existing = findAttribute(el, config.attributeName);
    const alreadyTagged = !!existing;
    const fingerprint = generateFingerprint(el);

    const insertionOffset = computeInsertionOffset(source, el);
    if (insertionOffset < 0) return;

    candidates.push({
      id: '', // assigned below
      element: el,
      detected,
      fingerprint,
      alreadyTagged,
      existingId: existing?.value ?? null,
      insertionOffset,
      source: 'generated', // tentative; finalized once we compare to the auto-generated id
      loop
    });
  });

  // Assign IDs, handling collisions by switching to hash-suffixed form (FR-1.7).
  const usedIds = new Set<string>();
  // Pre-reserve existing IDs so new ones never collide with them.
  for (const c of candidates) {
    if (c.alreadyTagged && c.existingId) {
      usedIds.add(c.existingId);
    }
  }

  let collisions = 0;
  for (const c of candidates) {
    // Always compute what the tagger *would* assign, so we can tell a
    // tagger-authored id (that was simply carried over from a previous run) apart
    // from a human-authored override of the tagger's suggestion.
    const wouldGenerate = generateId({
      componentName: options.componentName,
      elementType: c.detected.shortType,
      primaryValue: c.fingerprint.primaryValue,
      tag: c.detected.tag,
      fingerprint: c.fingerprint.fingerprint,
      needsHashSuffix: config.alwaysHash || !c.fingerprint.primaryValue,
      hashLength: options.hashLength,
      hashAlgorithm: config.hashAlgorithm,
      idFormat: config.idFormat
    });

    if (c.alreadyTagged && c.existingId) {
      c.id = c.existingId;
      c.source = c.existingId === wouldGenerate ? 'generated' : 'manual';
      continue;
    }

    let id = wouldGenerate;
    if (usedIds.has(id)) {
      collisions += 1;
      if (config.collisionStrategy === 'error') {
        throw new Error(
          `[tagger] collision on id '${id}' in ${options.componentPath} - ` +
            `two elements produce the same fingerprint and collisionStrategy='error' ` +
            `is set. Add an aria-label or formcontrolname to differentiate, or switch ` +
            `to collisionStrategy='hash-suffix'.`
        );
      }
      id = generateId({
        componentName: options.componentName,
        elementType: c.detected.shortType,
        primaryValue: c.fingerprint.primaryValue,
        tag: c.detected.tag,
        fingerprint: c.fingerprint.fingerprint,
        needsHashSuffix: true,
        hashLength: options.hashLength,
        hashAlgorithm: config.hashAlgorithm
      });
    }
    c.id = id;
    c.source = 'generated';
    usedIds.add(id);
  }

  // Build registry entries (sorted later by the writer). FR-1.3: keep existing IDs.
  const entries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>> = {};
  for (const c of candidates) {
    const dynSpec = getDynamicChildrenSpec(c.detected.tag);
    const entry: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
      component: options.componentPath.replace(/\\/g, '/'),
      tag: c.detected.tag,
      element_type: c.detected.longType,
      fingerprint: c.fingerprint.fingerprint,
      semantic: {
        formcontrolname: c.fingerprint.semantic.formcontrolname,
        name: c.fingerprint.semantic.name,
        routerlink: c.fingerprint.semantic.routerlink,
        aria_label: c.fingerprint.semantic.aria_label,
        placeholder: c.fingerprint.semantic.placeholder,
        text_content: c.fingerprint.semantic.text_content,
        type: c.fingerprint.semantic.type,
        role: c.fingerprint.semantic.role
      },
      source: c.source
    };
    if (dynSpec) {
      entry.dynamic_children = {
        pattern: dynSpec.pattern(c.id),
        addressing: [...dynSpec.addressing]
      };
    }
    entries[c.id] = entry;
  }

  // Insert attributes - sort by offset descending so earlier offsets stay valid.
  const toInsert = candidates.filter((c) => !c.alreadyTagged);
  toInsert.sort((a, b) => b.insertionOffset - a.insertionOffset);

  let tagged = source;
  for (const c of toInsert) {
    const snippet = ` ${config.attributeName}="${c.id}"`;
    tagged = tagged.slice(0, c.insertionOffset) + snippet + tagged.slice(c.insertionOffset);
  }

  // Loop warnings: elements rendered n times getting a static id.
  // A manually-authored testid (source="manual") is intentional, so don't warn.
  const loopWarnings: LoopWarning[] = [];
  for (const c of candidates) {
    if (!c.loop || c.source === 'manual') continue;
    const span = c.element.startSourceSpan;
    const line = span?.start.line != null ? span.start.line + 1 : 0;
    const column = span?.start.col != null ? span.start.col + 1 : 0;
    loopWarnings.push({
      componentPath: options.componentPath.replace(/\\/g, '/'),
      line,
      column,
      id: c.id,
      tag: c.detected.tag,
      loop: c.loop
    });
  }

  return { tagged, entries, collisions, loopWarnings };
}

/**
 * Compute where in the original source to splice ` data-testid="..."`.
 *
 * Angular's AST exposes `startSourceSpan` pointing at `<tag…>` (the entire
 * opening tag). We scan forward from the `<` for the tag name, then place
 * the insertion directly after it. If we can't find the tag cleanly, we
 * return -1 so the caller skips this element.
 */
function computeInsertionOffset(source: string, element: VisitedElement): number {
  const span = element.startSourceSpan;
  if (!span) return -1;
  const start = span.start.offset;
  const end = span.end.offset;
  if (start < 0 || end <= start || end > source.length) return -1;

  const tagName = getTagName(element);
  // Expect `<tagName`
  const lt = source.indexOf('<', start);
  if (lt < 0 || lt >= end) return -1;
  const afterLt = lt + 1;
  const slice = source.slice(afterLt, end);
  const match = /^([a-zA-Z][a-zA-Z0-9:\-_]*)/.exec(slice);
  if (!match || !match[1] || match[1].toLowerCase() !== tagName.toLowerCase()) return -1;
  return afterLt + match[1].length;
}
