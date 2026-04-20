/**
 * Shared types for the Robot Framework locator generator.
 *
 * Deliberately minimal — the registry is the single source of truth; these
 * types only capture what the renderer needs to write `.py` files.
 */

export interface LocatorEntry {
  /** Python variable name in full-path camelCase (`orderListTableAuftragsliste`). */
  variable: string;
  /** Complete XPath selector string as it appears in the emitted file. */
  selector: string;
  /** The raw testid — kept so the replacer can locate the line later. */
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
   * When true, existing files in `outDir` are overwritten. When false, an
   * error is raised for any pre-existing target. Default: true.
   */
  overwrite?: boolean;
  /**
   * Template for Python variable names. Placeholders: `{component}`,
   * `{element}`, `{key}`, `{tag}`, `{hash}` — same vocabulary as the tagger's
   * `idFormat`. Default: `{component}_{element}_{key}` keeps names readable
   * even for hash-only testids.
   */
  variableFormat?: string;
}

export interface GenerateLocatorsResult {
  modules: LocatorModule[];
  writtenPaths: string[];
}
