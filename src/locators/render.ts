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
 * (`saveAddress` stays `saveAddress`) - needed because discriminator values
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

export type SelectorEngine = 'xpath' | 'css';

export function xpathFor(
  testid: string,
  attributeName: string,
  xpathPrefix: string
): string {
  return `${xpathPrefix}//*[@${attributeName}='${testid}']`;
}

export function cssFor(
  testid: string,
  attributeName: string,
  cssPrefix: string
): string {
  // Robot's SeleniumLibrary auto-detects CSS by leading `css=`; Browser
  // Library accepts the same. testid values are kebab/underscore-only so
  // they don't need escaping inside the attribute selector.
  return `${cssPrefix}[${attributeName}='${testid}']`;
}

export function selectorFor(args: {
  engine: SelectorEngine;
  testid: string;
  attributeName: string;
  xpathPrefix: string;
  cssPrefix: string;
}): string {
  return args.engine === 'css'
    ? cssFor(args.testid, args.attributeName, args.cssPrefix)
    : xpathFor(args.testid, args.attributeName, args.xpathPrefix);
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
 *
 * Each entry carries a `name` so the resolver can apply field-specific
 * post-processing (e.g. compacting `child_shape` to the first diverging
 * child instead of the full chain) without losing track of the source.
 */
type FieldExtractor = (entry: RegistryEntry) => string | undefined;

export interface DiscriminatorField {
  name: string;
  extract: FieldExtractor;
}

export const DISCRIMINATOR_FIELDS: readonly DiscriminatorField[] = [
  { name: 'formcontrolname', extract: (e) => stringOrNull(e.semantic.formcontrolname) },
  { name: 'name', extract: (e) => stringOrNull(e.semantic.name) },
  { name: 'routerlink', extract: (e) => stringOrNull(e.semantic.routerlink) },
  { name: 'href', extract: (e) => stringOrNull(e.semantic.href) },
  { name: 'html_for', extract: (e) => stringOrNull(e.semantic.html_for) },
  { name: 'html_id', extract: (e) => stringOrNull(e.semantic.html_id) },
  { name: 'aria_label', extract: (e) => stringOrNull(e.semantic.aria_label) },
  { name: 'label', extract: (e) => stringOrNull(e.semantic.label) },
  { name: 'context.label_for', extract: (e) => stringOrNull(e.semantic.context?.label_for) },
  { name: 'context.wrapper_label', extract: (e) => stringOrNull(e.semantic.context?.wrapper_label) },
  { name: 'context.fieldset_legend', extract: (e) => stringOrNull(e.semantic.context?.fieldset_legend) },
  { name: 'context.preceding_heading', extract: (e) => stringOrNull(e.semantic.context?.preceding_heading) },
  { name: 'context.wrapper_formcontrolname', extract: (e) => stringOrNull(e.semantic.context?.wrapper_formcontrolname) },
  { name: 'context.aria_labelledby_text', extract: (e) => stringOrNull(e.semantic.context?.aria_labelledby_text) },
  { name: 'event.click', extract: (e) => stringFromMap(e.semantic.event_handlers, 'click') },
  { name: 'event.submit', extract: (e) => stringFromMap(e.semantic.event_handlers, 'submit') },
  { name: 'event.change', extract: (e) => stringFromMap(e.semantic.event_handlers, 'change') },
  { name: 'event.input', extract: (e) => stringFromMap(e.semantic.event_handlers, 'input') },
  { name: 'bound.data', extract: (e) => stringFromMap(e.semantic.bound_identifiers, 'data') },
  { name: 'bound.options', extract: (e) => stringFromMap(e.semantic.bound_identifiers, 'options') },
  { name: 'bound.value', extract: (e) => stringFromMap(e.semantic.bound_identifiers, 'value') },
  { name: 'bound.model', extract: (e) => stringFromMap(e.semantic.bound_identifiers, 'model') },
  { name: 'bound.item', extract: (e) => stringFromMap(e.semantic.bound_identifiers, 'item') },
  { name: 'bound.items', extract: (e) => stringFromMap(e.semantic.bound_identifiers, 'items') },
  { name: 'placeholder', extract: (e) => stringOrNull(e.semantic.placeholder) },
  { name: 'title', extract: (e) => stringOrNull(e.semantic.title) },
  { name: 'text_content', extract: (e) => stringOrNull(e.semantic.text_content) },
  { name: 'alt', extract: (e) => stringOrNull(e.semantic.alt) },
  { name: 'value', extract: (e) => stringOrNull(e.semantic.value) },
  { name: 'type', extract: (e) => stringOrNull(e.semantic.type) },
  { name: 'role', extract: (e) => stringOrNull(e.semantic.role) },
  { name: 'attr.severity', extract: (e) => stringFromMap(e.semantic.static_attributes, 'severity') },
  { name: 'attr.variant', extract: (e) => stringFromMap(e.semantic.static_attributes, 'variant') },
  { name: 'attr.icon', extract: (e) => stringFromMap(e.semantic.static_attributes, 'icon') },
  {
    name: 'child_shape',
    extract: (e) => {
      const cs = e.semantic.child_shape;
      if (!Array.isArray(cs) || cs.length === 0) return undefined;
      return cs.join('-');
    }
  }
];

/**
 * Compact suffix for `child_shape`: walk the structured arrays position by
 * position and return the first index whose value differs across all
 * members. `["h3:adresse", "p", "img"]` vs `["h3:adresse", "p", "span"]`
 * yields `["img", "span"]` instead of the full join - the prefix is shared
 * and adds no signal to the variable name.
 *
 * Returns null when no single position fully separates the group.
 */
export function compactChildShapeSuffix(
  members: readonly { entry: RegistryEntry }[]
): string[] | null {
  const arrays: string[][] = members.map((m) => {
    const cs = m.entry.semantic.child_shape;
    return Array.isArray(cs) ? (cs as string[]) : [];
  });
  const maxLen = Math.max(...arrays.map((a) => a.length));
  if (maxLen === 0) return null;

  for (let i = 0; i < maxLen; i++) {
    const tokens = arrays.map((a) => (i < a.length && a[i]!.length > 0 ? a[i]! : 'none'));
    const unique = new Set(tokens);
    if (unique.size !== members.length) continue;
    const hasReal = tokens.some((t) => t !== 'none');
    if (!hasReal) continue;
    return tokens;
  }
  return null;
}

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
 * own primary - appending `key_key` carries no info for the reader.
 *
 * Three passes, in order of precision:
 *   1. Fingerprint-walk: parse each member's fingerprint into field=value
 *      pairs, walk the canonical order (PRIORITY from the tagger), and pick
 *      the first field whose values are unique across all members. This is
 *      the most precise pass because the fingerprint is the same string the
 *      tagger uses to decide identity - whatever first separates two ids
 *      should also be the most readable suffix (`class=primary` vs
 *      `class=secondary` means `_primary` / `_secondary`).
 *   2. DISCRIMINATOR_FIELDS strict: extract semantic fields one by one,
 *      every member must have a non-empty value. Catches cases where the
 *      fingerprint string isn't available or its tokens collapse multiple
 *      values together.
 *   3. DISCRIMINATOR_FIELDS loose: a missing value becomes the sentinel
 *      `none`, so an asymmetric pair (one wrapper has children, one is
 *      empty) still disambiguates instead of falling through to the
 *      numeric/hash suffix. Needs at least one real value.
 */
export function findLocatorDiscriminator(
  members: readonly { testid: string; entry: RegistryEntry }[]
): string[] | null {
  if (members.length === 0) return null;

  // Pass 0 - walk the fingerprint string itself
  const fpResult = discriminateByFingerprint(members);
  if (fpResult) return fpResult;

  // Pass 1 - strict, semantic field extractors
  for (const field of DISCRIMINATOR_FIELDS) {
    const values: string[] = [];
    const seen = new Set<string>();
    let ok = true;
    for (const m of members) {
      const v = field.extract(m.entry);
      if (!v) { ok = false; break; }
      const primary = primarySemanticValue(m.entry);
      if (v === primary) { ok = false; break; }
      if (seen.has(v)) { ok = false; break; }
      seen.add(v);
      values.push(v);
    }
    if (ok && values.length === members.length) {
      return compactIfNeeded(field.name, values, members);
    }
  }
  // Pass 2 - loose, with `none` sentinel for absent values
  for (const field of DISCRIMINATOR_FIELDS) {
    const values: string[] = [];
    const seen = new Set<string>();
    let nonEmpty = 0;
    let ok = true;
    for (const m of members) {
      const raw = field.extract(m.entry);
      const v = raw ?? 'none';
      if (raw) {
        nonEmpty++;
        const primary = primarySemanticValue(m.entry);
        if (raw === primary) { ok = false; break; }
      }
      if (seen.has(v)) { ok = false; break; }
      seen.add(v);
      values.push(v);
    }
    if (ok && nonEmpty > 0 && values.length === members.length) {
      return compactIfNeeded(field.name, values, members);
    }
  }
  return null;
}

/**
 * Apply field-specific shortening so list-shaped fields like `child_shape`
 * don't produce variable names like `_h3AdresseAPHauptstr12ImgLogoSpanX`.
 * For `child_shape` we keep just the first child token that diverges across
 * the group; if no single position separates everyone, we leave the full
 * join in place (the caller will fall through to numeric/hash anyway).
 */
function compactIfNeeded(
  fieldName: string,
  values: string[],
  members: readonly { entry: RegistryEntry }[]
): string[] {
  if (fieldName !== 'child_shape') return values;
  const compact = compactChildShapeSuffix(members);
  return compact ?? values;
}

/**
 * Parse `tag|key1=val1|key2=val2|...` into a field-name-keyed map. The bare
 * tag token (no `=`) goes under the synthetic key `__tag__` so callers can
 * skip it (the tag is shared by definition for every member of a colliding
 * locator group, since `{element}` in the variable name comes from it).
 */
function parseFingerprintTokens(fingerprint: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!fingerprint) return map;
  const tokens = fingerprint.split('|');
  if (tokens.length === 0) return map;
  map.set('__tag__', tokens[0]!);
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const eqIdx = tok.indexOf('=');
    if (eqIdx === -1) {
      map.set(tok, '');
    } else {
      map.set(tok.slice(0, eqIdx), tok.slice(eqIdx + 1));
    }
  }
  return map;
}

function discriminateByFingerprint(
  members: readonly { testid: string; entry: RegistryEntry }[]
): string[] | null {
  const parsed = members.map((m) => parseFingerprintTokens(m.entry.fingerprint));

  // Build the canonical walk order: union of all field names, in the order
  // they first appear across the parsed maps. Each individual fingerprint is
  // already serialized by the tagger in PRIORITY order, so this respects the
  // same precedence the id generator uses (formcontrolname > aria-label >
  // ... > css_class > child_shape > attr.* > bound.* > on.* > class > struct.*).
  const order: string[] = [];
  const seen = new Set<string>();
  for (const p of parsed) {
    for (const key of p.keys()) {
      if (key === '__tag__') continue;
      if (!seen.has(key)) {
        seen.add(key);
        order.push(key);
      }
    }
  }
  if (order.length === 0) return null;

  for (const field of order) {
    const raw = parsed.map((p) => p.get(field));
    const sentinelled = raw.map((v) => (v === undefined || v.length === 0 ? 'none' : v));
    const unique = new Set(sentinelled);
    if (unique.size !== members.length) continue;
    // Need at least one real value - `none` vs `none` is no signal.
    const hasReal = raw.some((v) => v !== undefined && v.length > 0);
    if (!hasReal) continue;
    // Reject the case where the chosen field is also the entry's primary
    // semantic value: appending `_save` to `…_save` reads as redundant.
    let redundant = false;
    for (let i = 0; i < members.length; i++) {
      const v = raw[i];
      if (v === undefined || v.length === 0) continue;
      const primary = primarySemanticValue(members[i]!.entry);
      if (v === primary) { redundant = true; break; }
    }
    if (redundant) continue;
    // child_shape lives in the fingerprint as one big `tag:key-tag:key-...`
    // join. Use the structured array to prefer the first diverging child
    // instead of the whole chain so the variable name stays short.
    if (field === 'child_shape') {
      const compact = compactChildShapeSuffix(members);
      if (compact) return compact;
      // No single position fully separates all members to skip this field
      // and let the caller try the next one (or fall through to numeric).
      continue;
    }
    return sentinelled;
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
    // {testid} renders the camelCased raw testid - the single value that
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

/**
 * Render the `# testid-managed` trailer for a locator line. When the entry
 * carries a `lastGeneratedDate` it is appended as ` | YYYY-MM-DD` so reviewers
 * see at a glance which locators were (re-)generated in the last tagger run.
 * The pipe + ISO date format is what `classifyLocatorLine` parses back.
 */
export function renderManagedTrailer(entry: LocatorEntry): string {
  const base = '  # testid-managed';
  if (entry.lastGeneratedDate && entry.lastGeneratedDate.length > 0) {
    return `${base} | ${entry.lastGeneratedDate}`;
  }
  return base;
}

export function renderManagedLine(entry: LocatorEntry): string {
  return `${entry.variable} = "${entry.selector}"${renderManagedTrailer(entry)}`;
}

export function renderLocatorModule(mod: LocatorModule): string {
  const lines: string[] = [];
  lines.push('# Generated by testid-gen-locators - do not edit.');
  lines.push(`# Component: ${mod.component}`);
  lines.push('# Re-run testid-gen-locators after every tagger run that changes the registry.');
  lines.push('');
  for (const entry of mod.entries) {
    lines.push(renderManagedLine(entry));
  }
  lines.push('');
  return lines.join('\n');
}

export interface BuildLocatorEntryOptions {
  attributeName: string;
  xpathPrefix: string;
  /** Prefix for css mode. Defaults to 'css=' which Robot's SeleniumLibrary
   *  and the Browser Library both auto-detect. */
  cssPrefix?: string;
  /** Selector engine. Default 'xpath' for backwards compatibility. */
  selectorEngine?: SelectorEngine;
  variableFormat?: string;
  /** When set, variable name is derived from the entry via the template. */
  entry?: RegistryEntry;
  /**
   * Pre-frozen variable name (from `entry.locator_name`). When present, wins
   * over any template-derived name - this is the mechanism that keeps
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
  const selector = selectorFor({
    engine: options.selectorEngine ?? 'xpath',
    testid,
    attributeName: options.attributeName,
    xpathPrefix: options.xpathPrefix,
    cssPrefix: options.cssPrefix ?? 'css='
  });
  return {
    variable,
    selector,
    testid,
    frozen: usedFrozen
  };
}
