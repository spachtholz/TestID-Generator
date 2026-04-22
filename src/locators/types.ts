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
}

export interface GenerateLocatorsResult {
  modules: LocatorModule[];
  writtenPaths: string[];
  /** True when the registry was rewritten to persist `locator_name` changes. */
  registryWritten?: boolean;
}
