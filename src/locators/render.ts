// Pure renderers for the locator .py files. No I/O.

import { createHash } from 'node:crypto';
import { kebab, renderIdTemplate } from '../util/id-template.js';
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

/** Like `camelCaseTestid`, but preserves boundaries already in the input
 * (`saveAddress` stays `saveAddress`) — needed because discriminator values
 * often come from source-code identifiers in their original casing. */
export function camelCaseDiscriminator(value: string): string {
  if (!value) return '';
  const slug = kebab(value);
  if (slug === 'unknown' || slug.length === 0) return '';
  const parts = slug.split('-').filter((p) => p.length > 0);
  if (parts.length === 0) return '';
  const [first, ...rest] = parts;
  return first! + rest.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
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

/**
 * Priority order for the secondary-discriminator pass: identifier-like fields
 * (stable across edits) come first, soft text and styling fields last.
 */
type FieldExtractor = (entry: RegistryEntry) => string | undefined;

export const DISCRIMINATOR_FIELDS: readonly FieldExtractor[] = [
  (e) => stringOrNull(e.semantic.formcontrolname),
  (e) => stringOrNull(e.semantic.name),
  (e) => stringOrNull(e.semantic.routerlink),
  (e) => stringOrNull(e.semantic.href),
  (e) => stringOrNull(e.semantic.html_for),
  (e) => stringOrNull(e.semantic.html_id),
  (e) => stringOrNull(e.semantic.aria_label),
  (e) => stringOrNull(e.semantic.label),
  (e) => stringOrNull(e.semantic.context?.label_for),
  (e) => stringOrNull(e.semantic.context?.wrapper_label),
  (e) => stringOrNull(e.semantic.context?.fieldset_legend),
  (e) => stringOrNull(e.semantic.context?.preceding_heading),
  (e) => stringOrNull(e.semantic.context?.wrapper_formcontrolname),
  (e) => stringOrNull(e.semantic.context?.aria_labelledby_text),
  (e) => stringFromMap(e.semantic.event_handlers, 'click'),
  (e) => stringFromMap(e.semantic.event_handlers, 'submit'),
  (e) => stringFromMap(e.semantic.event_handlers, 'change'),
  (e) => stringFromMap(e.semantic.event_handlers, 'input'),
  (e) => stringFromMap(e.semantic.bound_identifiers, 'data'),
  (e) => stringFromMap(e.semantic.bound_identifiers, 'options'),
  (e) => stringFromMap(e.semantic.bound_identifiers, 'value'),
  (e) => stringFromMap(e.semantic.bound_identifiers, 'model'),
  (e) => stringFromMap(e.semantic.bound_identifiers, 'item'),
  (e) => stringFromMap(e.semantic.bound_identifiers, 'items'),
  (e) => stringOrNull(e.semantic.placeholder),
  (e) => stringOrNull(e.semantic.title),
  (e) => stringOrNull(e.semantic.text_content),
  (e) => stringOrNull(e.semantic.alt),
  (e) => stringOrNull(e.semantic.value),
  (e) => stringOrNull(e.semantic.type),
  (e) => stringOrNull(e.semantic.role),
  (e) => stringFromMap(e.semantic.static_attributes, 'severity'),
  (e) => stringFromMap(e.semantic.static_attributes, 'variant'),
  (e) => stringFromMap(e.semantic.static_attributes, 'icon'),
  (e) => {
    const cs = e.semantic.child_shape;
    if (!Array.isArray(cs) || cs.length === 0) return undefined;
    return cs.join('-');
  }
];

function stringOrNull(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stringFromMap(map: unknown, key: string): string | undefined {
  if (!map || typeof map !== 'object') return undefined;
  const v = (map as Record<string, unknown>)[key];
  return stringOrNull(v);
}

/**
 * Returns one value per member when a single field gives every member a
 * distinct non-empty value. A value is rejected when it equals the entry's
 * own primary — appending `key_key` carries no info for the reader.
 */
export function findLocatorDiscriminator(
  members: readonly { testid: string; entry: RegistryEntry }[]
): string[] | null {
  if (members.length === 0) return null;
  for (const extract of DISCRIMINATOR_FIELDS) {
    const values: string[] = [];
    const seen = new Set<string>();
    let ok = true;
    for (const m of members) {
      const v = extract(m.entry);
      if (!v) { ok = false; break; }
      const primary = primarySemanticValue(m.entry);
      if (v === primary) { ok = false; break; }
      if (seen.has(v)) { ok = false; break; }
      seen.add(v);
      values.push(v);
    }
    if (ok && values.length === members.length) return values;
  }
  return null;
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
  const usedFrozen =
    options.frozenName !== undefined && options.frozenName.length > 0;
  if (usedFrozen) {
    variable = options.frozenName!;
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
    testid,
    frozen: usedFrozen
  };
}
