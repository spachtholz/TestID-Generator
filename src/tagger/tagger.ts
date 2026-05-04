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
import { formatCollisionWarnings, type CollisionWarning } from './collision-warner.js';
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
import { formatHasPlaceholder } from '../util/id-template.js';

export interface TaggerRunOptions {
  cwd?: string;
  /**
   * Convenience override that sets both input and output registry directories
   * to the same path. Specific overrides (`registryInputDir`,
   * `registryOutputDir`) take precedence over this when both are set.
   */
  registryDir?: string;
  /**
   * Override the directory the tagger reads `testids.latest.json` and the
   * full version history from. Falls back to `registryDir` (option), then to
   * `config.registryInputDir`, then to `config.registryDir`.
   */
  registryInputDir?: string;
  /**
   * Override the directory the tagger writes new registry snapshots, the
   * latest pointer, backups and activity logs into. Falls back to
   * `registryDir` (option), then to `config.registryOutputDir`, then to
   * `config.registryDir`.
   */
  registryOutputDir?: string;
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
  collisionWarnings: CollisionWarning[];
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

  const baseRegistryDir = options.registryDir ?? config.registryDir;
  const registryInputDir = path.resolve(
    cwd,
    options.registryInputDir ?? config.registryInputDir ?? baseRegistryDir
  );
  const registryOutputDir = path.resolve(
    cwd,
    options.registryOutputDir ?? config.registryOutputDir ?? baseRegistryDir
  );
  const [previous, history] = await Promise.all([
    loadLatestRegistry(registryInputDir),
    loadFullHistory(registryInputDir)
  ]);
  const nextVersion = (previous?.version ?? 0) + 1;

  const newEntriesRaw: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>> = {};

  let filesTagged = 0;
  let filesSkipped = 0;
  let collisions = 0;
  const loopWarnings: LoopWarning[] = [];
  const collisionWarnings: CollisionWarning[] = [];

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

  // Pre-resolve disambiguated component slugs across the entire run when the
  // user opted into it. Without this, two `dialog.component.html` files in
  // different apps of a monorepo would both produce `dialog__…` testids and
  // overwrite each other in the registry map.
  const relFromCwds = files.map((f) => path.relative(cwd, f).replace(/\\/g, '/'));
  const componentNameMap = resolveTaggerComponentNames(
    files,
    relFromCwds,
    config.componentNaming
  );

  // Index previous registry entries by their owning component path so each
  // template-tagging call only sees the slice relevant to itself. Without
  // this filter, the registry-aware sibling-index resolver would have to
  // scan the whole registry per template and could match cross-component.
  const previousEntriesByComponent = indexPreviousEntriesByComponent(previous);

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const original = await fs.readFile(file, 'utf8');
    const relFromCwd = path.relative(cwd, file);
    const relFromRoot = path.relative(rootDir, file);
    const componentKey = relFromCwd.replace(/\\/g, '/');
    const result = tagTemplateSource(original, {
      componentName: componentNameMap.get(file) ?? componentNameFromPath(file),
      componentPath: relFromCwd,
      hashLength: config.hashLength,
      config,
      previousEntries: previousEntriesByComponent.get(componentKey)
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
    for (const w of result.collisionWarnings) {
      collisionWarnings.push({ ...w, componentPath: relFromCwd.replace(/\\/g, '/') });
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
      registryDir: registryOutputDir,
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
      dir: registryOutputDir,
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
      const activityWrite = await writeActivityReport({ dir: registryOutputDir, report });
      activityMarkdownPath = activityWrite.markdownPath;
      activityJsonPath = activityWrite.jsonPath;
    }

    // Write a structured collision dump whenever we detected unresolvable
    // duplicates. The file groups warnings by fingerprint so the largest
    // patterns float to the top — that's where the next fingerprint-tier
    // extension should attack.
    if (collisionWarnings.length > 0) {
      await writeCollisionDump({
        dir: registryOutputDir,
        version: nextVersion,
        warnings: collisionWarnings
      });
    }
  }

  if (config.loopWarnings && loopWarnings.length > 0) {
    writeStderr(formatLoopWarnings(loopWarnings));
  }
  if (collisionWarnings.length > 0) {
    writeStderr(formatCollisionWarnings(collisionWarnings));
  }

  return {
    version: nextVersion,
    registry,
    filesTagged,
    filesSkipped,
    entriesGenerated: Object.keys(registry.entries).length,
    collisions,
    loopWarnings,
    collisionWarnings,
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

/**
 * Group previous-registry entries by their owning component-path so the
 * tagger can pass each template only the slice it cares about.
 *
 * Entries without a `component` field (legacy registries) are dropped — the
 * worst case is that the registry-aware resolver falls back to source-position
 * ordering for those, which is the pre-feature behaviour anyway.
 */
function indexPreviousEntriesByComponent(
  previous: Registry | null
): Map<string, Record<string, RegistryEntry>> {
  const out = new Map<string, Record<string, RegistryEntry>>();
  if (!previous?.entries) return out;
  for (const [id, entry] of Object.entries(previous.entries)) {
    const comp = entry.component;
    if (!comp) continue;
    const key = comp.replace(/\\/g, '/');
    let bucket = out.get(key);
    if (!bucket) {
      bucket = {};
      out.set(key, bucket);
    }
    bucket[id] = entry;
  }
  return out;
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
    collisionWarnings: [],
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
  /**
   * Subset of the previous-version registry entries belonging to this
   * component. Consulted by the sibling-index collision resolver to keep
   * `--N` slot assignments stable across re-runs even when the source has
   * no testid attribute to anchor on. Empty / omitted ⇒ falls back to
   * pure source-position ordering (the legacy behaviour for first-time
   * tagging or for runs without a prior registry).
   */
  previousEntries?: Record<string, RegistryEntry>;
}

export interface TagTemplateResult {
  tagged: string;
  entries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>>;
  collisions: number;
  loopWarnings: LoopWarning[];
  collisionWarnings: CollisionWarning[];
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
  /** Source position used to sort sibling-index assignments deterministically. */
  sortKey: number;
  /** Filled in by collision resolution; persisted onto the registry entry. */
  disambiguator: { kind: 'sibling-index' | 'hash'; value: string } | null;
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
  walkElements(parsed.ast, (el, loop, parents) => {
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
    const fingerprint = generateFingerprint(el, {
      parents,
      rootNodes: parsed.ast,
      attributeName: config.attributeName,
      includeUtilityClasses: config.includeUtilityClasses
    });

    const insertionOffset = computeInsertionOffset(source, el);
    if (insertionOffset < 0) return;

    const span = el.startSourceSpan;
    const sortKey = span?.start.offset ?? insertionOffset;

    candidates.push({
      id: '', // assigned below
      element: el,
      detected,
      fingerprint,
      alreadyTagged,
      existingId: existing?.value ?? null,
      insertionOffset,
      source: 'generated', // tentative; finalized once we compare to the auto-generated id
      loop,
      sortKey,
      disambiguator: null
    });
  });

  // Assign IDs, handling collisions per the configured strategy (FR-1.7).
  const collisionWarnings: CollisionWarning[] = [];
  const collisions = assignCandidateIds({
    candidates,
    config,
    componentName: options.componentName,
    componentPath: options.componentPath,
    hashLength: options.hashLength,
    collisionWarnings,
    previousSlotMap: buildPreviousSlotMap(options.previousEntries)
  });

  // Build registry entries (sorted later by the writer). FR-1.3: keep existing IDs.
  const entries: Record<string, Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'>> = {};
  for (const c of candidates) {
    const dynSpec = getDynamicChildrenSpec(c.detected.tag);
    const snap = c.fingerprint.semantic;
    const entry: Omit<RegistryEntry, 'first_seen_version' | 'last_seen_version'> = {
      component: options.componentPath.replace(/\\/g, '/'),
      tag: c.detected.tag,
      element_type: c.detected.longType,
      fingerprint: c.fingerprint.fingerprint,
      semantic: buildSemanticForRegistry(snap),
      source: c.source
    };
    if (dynSpec) {
      entry.dynamic_children = {
        pattern: dynSpec.pattern(c.id),
        addressing: [...dynSpec.addressing]
      };
    }
    if (c.disambiguator) {
      entry.disambiguator = c.disambiguator;
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

  return { tagged, entries, collisions, loopWarnings, collisionWarnings };
}

/**
 * Group unresolvable collisions by fingerprint and write them to
 * `collisions.v{N}.json`. Largest groups first so a glance at the file
 * tells you which template-pattern is responsible for the bulk of the
 * collisions and what the missing differentiator should be.
 */
async function writeCollisionDump(args: {
  dir: string;
  version: number;
  warnings: readonly CollisionWarning[];
}): Promise<void> {
  const { dir, version, warnings } = args;

  const groups = new Map<string, CollisionWarning[]>();
  for (const w of warnings) {
    const list = groups.get(w.fingerprint) ?? [];
    list.push(w);
    groups.set(w.fingerprint, list);
  }
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  const dump = {
    version,
    total_collisions: warnings.length,
    unique_fingerprints: groups.size,
    groups: sorted.map(([fingerprint, members]) => ({
      fingerprint,
      count: members.length,
      // Carry one fully-detailed example (with the semantic snapshot) so the
      // user can see WHAT got extracted — that's how we diagnose missing
      // tiers. Subsequent members are listed location-only to keep the file
      // navigable.
      example: {
        component: members[0]!.componentPath,
        line: members[0]!.line,
        column: members[0]!.column,
        tag: members[0]!.tag,
        id: members[0]!.id,
        reason: members[0]!.reason,
        semantic: members[0]!.semantic
      },
      additional_locations: members.slice(1, 11).map((m) => ({
        component: m.componentPath,
        line: m.line,
        column: m.column,
        tag: m.tag
      })),
      omitted: Math.max(0, members.length - 11)
    }))
  };

  await fs.mkdir(dir, { recursive: true });
  const dumpPath = path.join(dir, `collisions.v${version}.json`);
  await fs.writeFile(dumpPath, JSON.stringify(dump, null, 2), 'utf8');
}

/**
 * Build the component-slug-per-file map for a tagger run.
 *
 * - 'basename' (default): identical to the legacy `componentNameFromPath`.
 * - 'basename-strict': throws on basename collisions across the run.
 * - 'disambiguate': prefixes the colliding basenames with their uncommon path
 *   segment, mirroring the locator-generator's behavior so the two tools stay
 *   in lockstep.
 */
function resolveTaggerComponentNames(
  files: readonly string[],
  componentPaths: readonly string[],
  mode: 'basename' | 'basename-strict' | 'disambiguate'
): Map<string, string> {
  const out = new Map<string, string>();
  if (mode === 'basename') {
    for (let i = 0; i < files.length; i++) {
      out.set(files[i]!, componentNameFromPath(files[i]!));
    }
    return out;
  }

  // Group by basename slug and disambiguate per group.
  const groups = new Map<string, { file: string; relPath: string }[]>();
  for (let i = 0; i < files.length; i++) {
    const slug = componentNameFromPath(files[i]!);
    const list = groups.get(slug) ?? [];
    list.push({ file: files[i]!, relPath: componentPaths[i]! });
    groups.set(slug, list);
  }

  for (const [slug, group] of groups) {
    if (group.length === 1) {
      out.set(group[0]!.file, slug);
      continue;
    }
    if (mode === 'basename-strict') {
      throw new Error(
        `[tagger] component-name collision on "${slug}":\n  ` +
          group.map((g) => g.relPath).join('\n  ') +
          `\nSet componentNaming: 'disambiguate' (or rename one of the templates).`
      );
    }
    // 'disambiguate' — derive a unique prefix from path segments
    const labels = disambiguatePathGroup(group.map((g) => g.relPath), slug);
    for (let i = 0; i < group.length; i++) {
      out.set(group[i]!.file, labels[i]!);
    }
  }
  return out;
}

function disambiguatePathGroup(paths: readonly string[], slug: string): string[] {
  const segArrays = paths.map((p) => p.split('/'));
  const minLen = Math.min(...segArrays.map((s) => s.length));

  let suffix = 0;
  while (suffix < minLen) {
    const ref = segArrays[0]![segArrays[0]!.length - 1 - suffix];
    if (!segArrays.every((s) => s[s.length - 1 - suffix] === ref)) break;
    suffix++;
  }

  let prefix = 0;
  while (prefix < minLen - suffix) {
    const ref = segArrays[0]![prefix];
    if (!segArrays.every((s) => s[prefix] === ref)) break;
    prefix++;
  }

  const labels: string[] = [];
  for (const segs of segArrays) {
    const middle = segs.slice(prefix, segs.length - suffix);
    labels.push(middle.length === 0 ? slug : `${middle.join('-')}-${slug}`);
  }
  // ensure uniqueness; if disambiguation didn't separate them, fall back to
  // including the full prefix
  const seen = new Set<string>();
  for (const l of labels) {
    if (seen.has(l)) {
      return segArrays.map((segs) => {
        const middle = segs.slice(0, segs.length - suffix);
        return `${middle.join('-')}-${slug}`;
      });
    }
    seen.add(l);
  }
  return labels;
}

/**
 * Translate the in-memory snapshot into the registry-shaped `semantic` object.
 * Empty containers are dropped so the persisted JSON stays compact, but every
 * Tier-0 field is always emitted (existing readers expect them).
 */
function buildSemanticForRegistry(
  snap: Fingerprint['semantic']
): RegistryEntry['semantic'] {
  const out: RegistryEntry['semantic'] = {
    formcontrolname: snap.formcontrolname,
    name: snap.name,
    routerlink: snap.routerlink,
    aria_label: snap.aria_label,
    placeholder: snap.placeholder,
    text_content: snap.text_content,
    type: snap.type,
    role: snap.role
  };
  // Optional named scalar fields — only emit when present so the JSON
  // stays compact for the common case.
  if (snap.title !== null) out.title = snap.title;
  if (snap.alt !== null) out.alt = snap.alt;
  if (snap.value !== null) out.value = snap.value;
  if (snap.html_id !== null) out.html_id = snap.html_id;
  if (snap.href !== null) out.href = snap.href;
  if (snap.src !== null) out.src = snap.src;
  if (snap.html_for !== null) out.html_for = snap.html_for;
  if (snap.label !== null) out.label = snap.label;
  // Catch-all maps and lists — drop empties.
  if (Object.keys(snap.static_attributes).length > 0) {
    out.static_attributes = { ...snap.static_attributes };
  }
  if (Object.keys(snap.bound_identifiers).length > 0) {
    out.bound_identifiers = { ...snap.bound_identifiers };
  }
  if (Object.keys(snap.event_handlers).length > 0) {
    out.event_handlers = { ...snap.event_handlers };
  }
  if (snap.i18n_keys.length > 0) out.i18n_keys = [...snap.i18n_keys];
  if (snap.bound_text_paths.length > 0) out.bound_text_paths = [...snap.bound_text_paths];
  if (snap.css_classes.length > 0) out.css_classes = [...snap.css_classes];
  if (snap.child_shape.length > 0) out.child_shape = [...snap.child_shape];
  if (Object.keys(snap.structural_directives).length > 0) {
    out.structural_directives = { ...snap.structural_directives };
  }
  // Surrounding context — emit only when at least one anchor was found.
  if (
    snap.context.label_for !== null ||
    snap.context.wrapper_label !== null ||
    snap.context.fieldset_legend !== null ||
    snap.context.preceding_heading !== null ||
    snap.context.wrapper_formcontrolname !== null ||
    snap.context.aria_labelledby_text !== null
  ) {
    out.context = { ...snap.context };
  }
  return out;
}

interface PreviousSlot {
  id: string;
  fingerprint: string;
  disambiguatorValue: number;
}

/**
 * Only `sibling-index`-kind disambiguators are indexed — hash-suffixed ids
 * and singletons have nothing to anchor on for slot reuse. Lists are sorted
 * ascending so the resolver's "lowest unclaimed slot" pass is deterministic.
 */
function buildPreviousSlotMap(
  previousEntries: Record<string, RegistryEntry> | undefined
): Map<string, PreviousSlot[]> {
  const out = new Map<string, PreviousSlot[]>();
  if (!previousEntries) return out;
  for (const [id, entry] of Object.entries(previousEntries)) {
    const dis = entry.disambiguator;
    if (!dis || dis.kind !== 'sibling-index') continue;
    const suffix = `--${dis.value}`;
    if (!id.endsWith(suffix)) continue;
    const bareId = id.slice(0, -suffix.length);
    const value = Number(dis.value);
    if (!Number.isFinite(value) || value <= 0) continue;
    let list = out.get(bareId);
    if (!list) {
      list = [];
      out.set(bareId, list);
    }
    list.push({ id, fingerprint: entry.fingerprint, disambiguatorValue: value });
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.disambiguatorValue - b.disambiguatorValue);
  }
  return out;
}

/**
 * Resolve every candidate's final id, applying the configured collision
 * strategy. Mutates each candidate's `id`, `source` and `disambiguator`
 * in place; returns the count of collisions seen for the run-level metric.
 *
 * Strategies:
 * - 'error'         — throw on first collision.
 * - 'hash-suffix'   — re-render with `{hash}` filled in.
 * - 'sibling-index' — assign `--1`, `--2`, … via the `{disambiguator}` slot.
 *                     Registry-aware: when the previous registry contains
 *                     fingerprint-matching slots for this bare-id family,
 *                     each match keeps its old slot value; new candidates
 *                     pick the next free slot. When no previous registry is
 *                     available, falls back to source-position ordering.
 * - 'auto'          — try sibling-index first (readable), fall back to hash
 *                     if the format has no disambiguator slot, and finally
 *                     warn if nothing helped.
 */
function assignCandidateIds(args: {
  candidates: TagCandidate[];
  config: TaggerConfig;
  componentName: string;
  componentPath: string;
  hashLength: number;
  collisionWarnings: CollisionWarning[];
  previousSlotMap: Map<string, PreviousSlot[]>;
}): number {
  const { candidates, config, componentName, componentPath, hashLength, collisionWarnings, previousSlotMap } = args;

  // Pre-compute the bare ("would-generate") id for every candidate so we know
  // who collides with whom up front. This lets sibling-index assign suffixes
  // by *group*, not greedily one-by-one.
  const wouldGenerate: string[] = candidates.map((c) =>
    generateId({
      componentName,
      elementType: c.detected.shortType,
      primaryValue: c.fingerprint.primaryValue,
      tag: c.detected.tag,
      fingerprint: c.fingerprint.fingerprint,
      needsHashSuffix: config.alwaysHash || !c.fingerprint.primaryValue,
      hashLength,
      hashAlgorithm: config.hashAlgorithm,
      idFormat: config.idFormat
    })
  );

  // Group all candidates (tagged + untagged alike) by their bare id so the
  // collision resolver assigns `--N` slots based on the full group, then can
  // tell whether each existing testid matches what the tagger *would* have
  // computed. That lets carried-over disambiguated ids stay 'generated'
  // instead of being misclassified as manual on every re-run.
  const byBareId = new Map<string, number[]>();
  for (let i = 0; i < candidates.length; i++) {
    const bare = wouldGenerate[i]!;
    const list = byBareId.get(bare) ?? [];
    list.push(i);
    byBareId.set(bare, list);
  }

  let collisions = 0;
  const formatHasHashSlot = formatHasPlaceholder(config.idFormat, 'hash')
    || formatHasPlaceholder(config.idFormat, 'hash:-');
  const formatHasDisambiguatorSlot = formatHasPlaceholder(config.idFormat, 'disambiguator')
    || formatHasPlaceholder(config.idFormat, 'disambiguator:--');

  const usedIds = new Set<string>();

  // Process groups in deterministic order (alphabetical bare id) so
  // re-runs without source edits produce the same assignment.
  const groupKeys = [...byBareId.keys()].sort();
  for (const bare of groupKeys) {
    const indices = byBareId.get(bare)!;

    // Sort the group deterministically by source position so suffix
    // assignment is stable across re-runs (same source → same suffix).
    indices.sort((a, b) => candidates[a]!.sortKey - candidates[b]!.sortKey);

    // Group shrunk to a singleton — heuristic mapping risk, surface it.
    const previousSlotsForBare = previousSlotMap.get(bare) ?? [];
    if (indices.length === 1 && previousSlotsForBare.length > 1) {
      const c = candidates[indices[0]!]!;
      const span = c.element.startSourceSpan;
      collisionWarnings.push({
        componentPath: componentPath.replace(/\\/g, '/'),
        line: span?.start.line != null ? span.start.line + 1 : 0,
        column: span?.start.col != null ? span.start.col + 1 : 0,
        id: bare,
        tag: c.detected.tag,
        reason: 'collision-group-size-changed',
        fingerprint: c.fingerprint.fingerprint,
        semantic: c.fingerprint.semantic as unknown as Record<string, unknown>,
        previousGroupSize: previousSlotsForBare.length,
        currentGroupSize: 1
      });
    }

    if (indices.length === 1) {
      // Singleton group — assign the bare id directly. No disambiguator
      // needed; the existing-id check below tells generated vs. manual.
      const i = indices[0]!;
      const c = candidates[i]!;
      const wouldAssign = bare;
      finalizeCandidate(c, wouldAssign, null, usedIds);
      continue;
    }

    // n > 1 → real collision. Apply the configured strategy.
    if (config.collisionStrategy === 'error') {
      const c = candidates[indices[0]!]!;
      throw new Error(
        `[tagger] collision on id '${bare}' in ${componentPath} - ` +
          `${indices.length} elements produce the same fingerprint and ` +
          `collisionStrategy='error' is set. Add an aria-label or formcontrolname ` +
          `to differentiate, or switch to collisionStrategy='auto' (default), ` +
          `'sibling-index' or 'hash-suffix'. (first offender: <${c.detected.tag}>)`
      );
    }

    collisions += indices.length;

    // Compute the would-be assignment for the entire group up front. Each
    // strategy returns either an array of (id, disambiguator) pairs or null
    // if it can't resolve.
    let assignment: Array<{ id: string; disambiguator: { kind: 'sibling-index' | 'hash'; value: string } }> | null = null;

    if (config.collisionStrategy === 'sibling-index' || config.collisionStrategy === 'auto') {
      assignment = computeSiblingIndexAssignment({
        indices,
        candidates,
        bareIds: wouldGenerate,
        config,
        componentName,
        hashLength,
        formatHasDisambiguatorSlot,
        previousSlots: previousSlotsForBare
      });

      if (
        previousSlotsForBare.length > 0 &&
        previousSlotsForBare.length !== indices.length
      ) {
        const c = candidates[indices[0]!]!;
        const span = c.element.startSourceSpan;
        collisionWarnings.push({
          componentPath: componentPath.replace(/\\/g, '/'),
          line: span?.start.line != null ? span.start.line + 1 : 0,
          column: span?.start.col != null ? span.start.col + 1 : 0,
          id: bare,
          tag: c.detected.tag,
          reason: 'collision-group-size-changed',
          fingerprint: c.fingerprint.fingerprint,
          semantic: c.fingerprint.semantic as unknown as Record<string, unknown>,
          previousGroupSize: previousSlotsForBare.length,
          currentGroupSize: indices.length
        });
      }
    }

    if (assignment === null && (config.collisionStrategy === 'hash-suffix' || config.collisionStrategy === 'auto')) {
      assignment = computeHashSuffixAssignment({
        indices,
        candidates,
        config,
        componentName,
        hashLength,
        formatHasHashSlot
      });
    }

    if (assignment !== null) {
      // Detect duplicates within the proposed assignment (e.g. hash-suffix
      // on byte-identical fingerprints) — fall through to the warning path.
      const seen = new Set<string>();
      let allUnique = true;
      for (const a of assignment) {
        if (seen.has(a.id)) { allUnique = false; break; }
        seen.add(a.id);
      }
      if (allUnique) {
        for (let n = 0; n < indices.length; n++) {
          const c = candidates[indices[n]!]!;
          finalizeCandidate(c, assignment[n]!.id, assignment[n]!.disambiguator, usedIds);
        }
        continue;
      }
    }

    // Truly unresolvable — fall back to letting them share the bare id
    // and emit a warning so the user can extend the fingerprint.
    for (const i of indices) {
      const c = candidates[i]!;
      finalizeCandidate(c, bare, null, usedIds);
      const span = c.element.startSourceSpan;
      collisionWarnings.push({
        componentPath: componentPath.replace(/\\/g, '/'),
        line: span?.start.line != null ? span.start.line + 1 : 0,
        column: span?.start.col != null ? span.start.col + 1 : 0,
        id: bare,
        tag: c.detected.tag,
        reason: !formatHasHashSlot && !formatHasDisambiguatorSlot
          ? 'no-hash-placeholder'
          : 'identical-fingerprint',
        fingerprint: c.fingerprint.fingerprint,
        semantic: c.fingerprint.semantic as unknown as Record<string, unknown>
      });
    }
  }

  return collisions;
}

/**
 * Settle a single candidate's id + source + disambiguator. When the element
 * already carries a testid, distinguish manual overrides (existing != what
 * the tagger would compute, including any disambiguator) from carried-over
 * tagger-authored ids.
 */
function finalizeCandidate(
  c: TagCandidate,
  wouldAssign: string,
  disambiguator: { kind: 'sibling-index' | 'hash'; value: string } | null,
  usedIds: Set<string>
): void {
  if (c.alreadyTagged && c.existingId) {
    if (c.existingId === wouldAssign) {
      c.id = c.existingId;
      c.source = 'generated';
      c.disambiguator = disambiguator;
    } else {
      c.id = c.existingId;
      c.source = 'manual';
      c.disambiguator = null;
    }
  } else {
    c.id = wouldAssign;
    c.source = 'generated';
    c.disambiguator = disambiguator;
  }
  usedIds.add(c.id);
}

interface ComputeArgs {
  indices: number[];
  candidates: TagCandidate[];
  config: TaggerConfig;
  componentName: string;
  hashLength: number;
}

interface AssignmentEntry {
  id: string;
  disambiguator: { kind: 'sibling-index' | 'hash'; value: string };
}

/**
 * Three-phase resolution: (1) candidates with an existing testid lock onto
 * its numeric suffix, (2) remaining candidates inherit the lowest unclaimed
 * previous slot whose fingerprint matches, (3) the rest take the next free
 * numeric value. For byte-identical insertion at the FRONT or MIDDLE of a
 * group the mapping is informationally underdetermined — the caller surfaces
 * a `collision-group-size-changed` warning so the user can verify.
 */
function computeSiblingIndexAssignment(
  args: ComputeArgs & {
    bareIds: readonly string[];
    formatHasDisambiguatorSlot: boolean;
    previousSlots: readonly PreviousSlot[];
  }
): AssignmentEntry[] | null {
  const {
    indices, candidates, bareIds, config, componentName, hashLength,
    formatHasDisambiguatorSlot, previousSlots
  } = args;
  if (indices.length === 0) return null;

  const claimedValues = new Set<number>();
  const lockedAssignments = new Map<number, number>();
  for (const i of indices) {
    const c = candidates[i]!;
    if (!c.alreadyTagged || !c.existingId) continue;
    const m = c.existingId.match(/--(\d+)$/);
    if (!m) continue;
    const v = Number(m[1]);
    if (!Number.isFinite(v) || v <= 0) continue;
    lockedAssignments.set(i, v);
    claimedValues.add(v);
  }

  // Pre-claim any previous slot already locked by an existingId so it
  // isn't handed to a different unlocked candidate.
  const claimedPreviousIdx = new Set<number>();
  for (let s = 0; s < previousSlots.length; s++) {
    if (claimedValues.has(previousSlots[s]!.disambiguatorValue)) {
      claimedPreviousIdx.add(s);
    }
  }

  const assignmentValue = new Map<number, number>();
  for (const idx of indices) {
    if (lockedAssignments.has(idx)) {
      assignmentValue.set(idx, lockedAssignments.get(idx)!);
      continue;
    }
    const candFp = candidates[idx]!.fingerprint.fingerprint;

    let value = -1;
    for (let s = 0; s < previousSlots.length; s++) {
      if (claimedPreviousIdx.has(s)) continue;
      if (previousSlots[s]!.fingerprint !== candFp) continue;
      claimedPreviousIdx.add(s);
      value = previousSlots[s]!.disambiguatorValue;
      break;
    }
    if (value < 0) {
      let next = 1;
      while (claimedValues.has(next)) next++;
      value = next;
    }
    claimedValues.add(value);
    assignmentValue.set(idx, value);
  }

  const out: AssignmentEntry[] = [];
  for (let n = 0; n < indices.length; n++) {
    const idx = indices[n]!;
    const c = candidates[idx]!;
    const value = assignmentValue.get(idx)!;
    const valueStr = String(value);
    const id = formatHasDisambiguatorSlot
      ? generateId({
          componentName,
          elementType: c.detected.shortType,
          primaryValue: c.fingerprint.primaryValue,
          tag: c.detected.tag,
          fingerprint: c.fingerprint.fingerprint,
          needsHashSuffix: config.alwaysHash || !c.fingerprint.primaryValue,
          hashLength,
          hashAlgorithm: config.hashAlgorithm,
          idFormat: config.idFormat,
          disambiguator: valueStr
        })
      : `${bareIds[idx]!}--${valueStr}`;
    out.push({ id, disambiguator: { kind: 'sibling-index', value: valueStr } });
  }
  return out;
}

/**
 * Compute hash-suffixed assignments for a colliding group. Returns null when
 * the format has no `{hash}` slot — caller should fall back to another
 * strategy or the warning path. The returned ids may still contain duplicates
 * if the group's fingerprints are byte-identical; the caller checks for that.
 */
function computeHashSuffixAssignment(
  args: ComputeArgs & { formatHasHashSlot: boolean }
): AssignmentEntry[] | null {
  const { indices, candidates, config, componentName, hashLength, formatHasHashSlot } = args;
  if (!formatHasHashSlot) return null;

  const out: AssignmentEntry[] = [];
  for (const i of indices) {
    const c = candidates[i]!;
    const id = generateId({
      componentName,
      elementType: c.detected.shortType,
      primaryValue: c.fingerprint.primaryValue,
      tag: c.detected.tag,
      fingerprint: c.fingerprint.fingerprint,
      needsHashSuffix: true,
      hashLength,
      hashAlgorithm: config.hashAlgorithm,
      idFormat: config.idFormat
    });
    const hash = id.match(/[a-f0-9]{4,16}$/)?.[0] ?? id;
    out.push({ id, disambiguator: { kind: 'hash', value: hash } });
  }
  return out;
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
