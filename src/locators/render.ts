// Pure renderers for the locator .py files. No I/O.

import { createHash } from 'node:crypto';
import { renderIdTemplate } from '../util/id-template.js';
import type { RegistryEntry } from '../registry/index.js';
import type { LocatorEntry, LocatorModule } from './types.js';

export const DEFAULT_VARIABLE_FORMAT = '{component}_{element}_{key}';

/** `order-list__table--auftragsliste` -> `orderListTableAuftragsliste`. */
export function camelCaseTestid(testid: string): string {
  const parts = testid
    .split(/[^a-zA-Z0-9]+/)
    .filter((p) => p.length > 0)
    .map((p) => p.toLowerCase());
  if (parts.length === 0) return 'tid';
  const [first, ...rest] = parts;
  const joined =
    first! +
    rest
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  return /^[0-9]/.test(joined) ? `tid${joined.charAt(0).toUpperCase()}${joined.slice(1)}` : joined;
}

export function filenameForComponent(component: string): string {
  const stem = component.replace(/-/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
  return `${stem}.py`;
}

export function xpathFor(
  testid: string,
  attributeName: string,
  xpathPrefix: string
): string {
  return `${xpathPrefix}//*[@${attributeName}='${testid}']`;
}

/**
 * Pick the most-distinctive semantic value to drive the `{key}` placeholder
 * in the locator variable name. Mirrors the tagger's priority list so two
 * elements that the tagger considered semantically distinct also get
 * distinct, readable variable names instead of falling through to the
 * same `text_content` and triggering a `_2`/`_3` collision suffix.
 */
function primarySemanticValue(entry: RegistryEntry): string {
  const s = (entry.semantic ?? {}) as Record<string, unknown>;
  const ctx = (s.context ?? {}) as Record<string, unknown>;
  const events = (s.event_handlers ?? {}) as Record<string, unknown>;
  const boundIdents = (s.bound_identifiers ?? {}) as Record<string, unknown>;
  const i18nKeys = Array.isArray(s.i18n_keys) ? (s.i18n_keys as unknown[]) : [];
  const boundTextPaths = Array.isArray(s.bound_text_paths)
    ? (s.bound_text_paths as unknown[])
    : [];
  const cssClasses = Array.isArray(s.css_classes) ? (s.css_classes as unknown[]) : [];
  const childShape = Array.isArray(s.child_shape) ? (s.child_shape as unknown[]) : [];
  const structDirs = (s.structural_directives ?? {}) as Record<string, unknown>;

  const candidates: unknown[] = [
    s.formcontrolname,
    s.name,
    s.aria_label,
    s.label,
    s.placeholder,
    s.routerlink,
    ctx.label_for,
    ctx.wrapper_label,
    ctx.fieldset_legend,
    ctx.wrapper_formcontrolname,
    ctx.preceding_heading,
    ctx.aria_labelledby_text,
    i18nKeys[0],
    s.text_content,
    events.click,
    events.change,
    events.submit,
    events.input,
    s.title,
    s.href,
    s.alt,
    boundIdents.data,
    boundIdents.options,
    boundIdents.value,
    boundIdents.model,
    boundTextPaths[0],
    structDirs.ngif,
    structDirs.ngforof,
    structDirs.ngswitchcase,
    s.value,
    s.type,
    s.role,
    s.html_id,
    pickReadableClass(cssClasses),
    childShape.length > 0 ? (childShape as string[]).join('-') : undefined
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }
  return entry.tag;
}

/** Pick the first non-utility class; if all are utilities, return the first. */
function pickReadableClass(classes: readonly unknown[]): string | undefined {
  let firstClass: string | undefined;
  for (const c of classes) {
    if (typeof c !== 'string' || c.length === 0) continue;
    if (firstClass === undefined) firstClass = c;
    if (!isLikelyUtilityClass(c)) return c;
  }
  return firstClass;
}

function isLikelyUtilityClass(cls: string): boolean {
  if (/^(m|mx|my|mt|mb|ml|mr|p|px|py|pt|pb|pl|pr|w|h|min|max|gap|space|inset|top|left|right|bottom|z|order)-/.test(cls)) return true;
  if (/^(text|bg|border|ring|shadow|font|leading|tracking|rounded|opacity|cursor|outline)-/.test(cls)) return true;
  if (/^(flex|grid|block|inline|hidden|visible|absolute|relative|fixed|sticky|static)$/.test(cls)) return true;
  if (/^(items|justify|content|self|place)-/.test(cls)) return true;
  if (/^(sm|md|lg|xl|2xl):/.test(cls)) return true;
  if (/^col-|^row-/.test(cls)) return true;
  return false;
}

export function componentSlug(componentPath: string): string {
  const base = componentPath.split(/[\\/]/).pop() ?? componentPath;
  return base
    .replace(/\.component\.html$/i, '')
    .replace(/\.template\.html$/i, '')
    .replace(/\.html$/i, '');
}

/** Build a Python variable name from the registry entry + format template. */
export function renderVariableName(
  entry: RegistryEntry,
  testid: string,
  format: string = DEFAULT_VARIABLE_FORMAT,
  componentLabel?: string
): string {
  const hash = createHash('sha256').update(entry.fingerprint, 'utf8').digest('hex').slice(0, 6);
  const componentSource = componentLabel ?? componentSlug(entry.component);
  const values: Record<string, string> = {
    component: camelCaseTestid(componentSource),
    element: camelCaseTestid(entry.element_type),
    key: camelCaseTestid(primarySemanticValue(entry)),
    tag: camelCaseTestid(entry.tag),
    hash,
    // {testid} renders the camelCased raw testid — the single value that
    // survives template structure changes (tagger preserves data-testid
    // attributes across runs), making it the most stable anchor available.
    testid: camelCaseTestid(testid)
  };
  const raw = renderIdTemplate(format, values);
  const sanitized = sanitizePythonIdentifier(raw);
  if (sanitized === 'tid' || sanitized.length === 0) {
    return camelCaseTestid(testid);
  }
  return sanitized;
}

function sanitizePythonIdentifier(input: string): string {
  const scrubbed = input
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (scrubbed.length === 0) return 'tid';
  return /^[0-9]/.test(scrubbed) ? `tid_${scrubbed}` : scrubbed;
}

export function renderLocatorModule(mod: LocatorModule): string {
  const lines: string[] = [];
  lines.push('# Generated by testid-gen-locators - do not edit.');
  lines.push(`# Component: ${mod.component}`);
  lines.push('# Re-run testid-gen-locators after every tagger run that changes the registry.');
  lines.push('');
  for (const entry of mod.entries) {
    lines.push(`${entry.variable} = "${entry.selector}"  # testid-managed`);
  }
  lines.push('');
  return lines.join('\n');
}

export interface BuildLocatorEntryOptions {
  attributeName: string;
  xpathPrefix: string;
  variableFormat?: string;
  /** When set, variable name is derived from the entry via the template. */
  entry?: RegistryEntry;
  /**
   * Pre-frozen variable name (from `entry.locator_name`). When present, wins
   * over any template-derived name — this is the mechanism that keeps
   * Python constants stable across semantic edits.
   */
  frozenName?: string;
  /** Overrides the `{component}` placeholder source. */
  componentLabel?: string;
}

export function buildLocatorEntry(
  testid: string,
  options: BuildLocatorEntryOptions
): LocatorEntry {
  let variable: string;
  if (options.frozenName !== undefined && options.frozenName.length > 0) {
    variable = options.frozenName;
  } else if (options.entry !== undefined) {
    variable = renderVariableName(
      options.entry,
      testid,
      options.variableFormat,
      options.componentLabel
    );
  } else {
    variable = camelCaseTestid(testid);
  }
  return {
    variable,
    selector: xpathFor(testid, options.attributeName, options.xpathPrefix),
    testid
  };
}
