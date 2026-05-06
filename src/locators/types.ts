/**
 * Shared types for the Robot Framework locator generator.
 *
 * Deliberately minimal - the registry is the single source of truth; these
 * types only capture what the renderer needs to write `.py` files.
 */

export interface LocatorEntry {
  /** Python variable name in full-path camelCase (`orderListTableAuftragsliste`). */
  variable: string;
  /** Complete XPath selector string as it appears in the emitted file. */
  selector: string;
  /** The raw testid - kept so the replacer can locate the line later. */
  testid: string;
  /** True when `variable` came from a previously-persisted locator_name. */
  frozen?: boolean;
  /**
   * ISO date (`YYYY-MM-DD`) of the entry's last (re-)generation in the
   * registry. Carried through so the renderer can surface it in the managed
   * comment when `includeGeneratedDate` is on. Absent = registry entry has
   * no `last_generated_at` (e.g. minimal profile).
   */
  lastGeneratedDate?: string;
}

export interface LocatorModule {
  /** Component short name, e.g. `order-list`. */
  component: string;
  /** Target filename, e.g. `order_list.py`. */
  filename: string;
  /** Locator constants, ordered alphabetically by variable. */
  entries: LocatorEntry[];
}

export interface GenerateLocatorsOptions {
  /** Output directory for the per-component Python modules. */
  outDir: string;
  /**
   * Path of the registry file the caller loaded. When `lockNames` mutates
   * entries (adding/refreshing `locator_name`), the updated registry is
   * rewritten to this path so the lock survives future runs.
   */
  registryPath?: string;
  /**
   * Custom XPath prefix (default `xpath:`). Pass an empty string if your
   * SeleniumLibrary auto-detects XPath from leading `//`.
   */
  xpathPrefix?: string;
  /**
   * Custom attribute name; defaults to `data-testid`. Must match whatever
   * the tagger wrote into the templates.
   */
  attributeName?: string;
  /**
   * @deprecated Use `mode` instead.
   *
   * When true, existing files in `outDir` are overwritten. When false, an
   * error is raised for any pre-existing target. If `mode` is also set, it
   * wins.
   */
  overwrite?: boolean;
  /**
   * Write-strategy for existing files:
   *   - `merge` (default) - preserve manual lines, replace only `# testid-managed` lines
   *   - `overwrite` - rewrite the file from scratch
   *   - `refuse` - error if the target file already exists
   */
  mode?: 'merge' | 'overwrite' | 'refuse';
  /**
   * Template for Python variable names. Placeholders: `{component}`,
   * `{element}`, `{key}`, `{tag}`, `{hash}`, `{testid}` - same vocabulary as
   * the tagger's `idFormat`, plus `{testid}` which mirrors the (preserved)
   * raw testid and is therefore the most stable anchor against template
   * edits. Default: `{component}_{element}_{key}` keeps names readable even
   * for hash-only testids.
   */
  variableFormat?: string;
  /**
   * When true, gen-locators reuses any previously persisted variable name
   * stored on the registry entry (`locator_name`) and writes freshly-computed
   * names back into the registry file for first-sighted entries. This makes
   * Python constants bulletproof against semantic drift (e.g. aria-label
   * rewordings) at the cost of a registry round-trip.
   */
  lockNames?: boolean;
  /**
   * Force `lockNames` to overwrite any persisted `locator_name`. Use once
   * after intentionally changing `variableFormat` so the next run reconciles
   * all stored names with the new template.
   */
  regenerateNames?: boolean;
  /**
   * How to derive the component label that drives filenames and `{component}`:
   *   - `basename` (default) - strip extension; silent overwrite on collision
   *   - `basename-strict` - same naming, but throw on basename collision
   *   - `disambiguate` - prepend the differing path segment(s) on collision
   */
  componentNaming?: 'basename' | 'basename-strict' | 'disambiguate';
  /**
   * When true, return a MigrationReport on the result describing how
   * component labels and variable names differ from the legacy `basename`
   * naming, plus orphan-file detection.
   */
  migrationReport?: boolean;
  /**
   * When true, the renderer appends ` | YYYY-MM-DD` (from `last_generated_at`)
   * to the `# testid-managed` marker. The merge step strips and re-renders
   * the suffix so dates always reflect the current run, never stale ones.
   */
  includeGeneratedDate?: boolean;
  /**
   * Strategy when no semantic discriminator can split colliding variable
   * names. `numeric` (default, legacy) walks `_2`, `_3`, …; `hash` appends
   * a short fingerprint hash that is stable across runs and independent of
   * iteration order.
   */
  collisionSuffix?: 'numeric' | 'hash';
  /**
   * Selector engine. `xpath` (default) emits
   * `xpath://*[@data-testid='...']`; `css` emits `css=[data-testid='...']`.
   * CSS is faster and Browser-Library-friendly.
   */
  selectorEngine?: 'xpath' | 'css';
  /** Prefix for css selectors. Default `css=`. */
  cssPrefix?: string;
}

export interface MigrationReportEntry {
  componentPath: string;
  oldComponent: string;
  newComponent: string;
  oldFilename: string;
  newFilename: string;
  variables: { testid: string; oldVariable: string; newVariable: string }[];
}

export interface MigrationReport {
  entries: MigrationReportEntry[];
  orphanFiles: string[];
}

/**
 * Same Python variable name produced by two or more components - Robot
 * Framework imports are name-keyed at module load, so the second module
 * silently shadows the first when both are referenced in one suite.
 */
export interface CrossFileCollision {
  variable: string;
  components: string[];
}

export interface GenerateLocatorsResult {
  modules: LocatorModule[];
  writtenPaths: string[];
  /** True when the registry was rewritten to persist `locator_name` changes. */
  registryWritten?: boolean;
  migrationReport?: MigrationReport;
  /** Cross-component variable-name collisions detected during the run. Empty
   *  when every module's variable set is globally unique. */
  crossFileCollisions?: CrossFileCollision[];
}
