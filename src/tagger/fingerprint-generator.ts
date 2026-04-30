// Fingerprint extraction (FR-1.6, FR-1.9). Deterministic: no paths, no times.

import {
  findAttribute,
  getAllStaticAttributes,
  getBoundIdentifiers,
  getEventHandlerNames,
  getInterpolationData,
  getStaticTextContent,
  getTagName,
  resolveContextAnchors,
  type ContextAnchors,
  type VisitedElement
} from './template-parser.js';
import type { TmplAstNode } from '@angular/compiler';

export interface Fingerprint {
  /** The canonical fingerprint string (pipe-separated). */
  fingerprint: string;
  /** Which semantic field (if any) was picked as the primary key. */
  primaryKey: SemanticKey | null;
  /** The raw value of the primary key, trimmed + normalised. */
  primaryValue: string | null;
  /** Per-field normalised semantic attributes for registry storage. */
  semantic: SemanticSnapshot;
}

export type SemanticKey =
  // --- Tier 0: own-element semantic attributes ---------------------------
  | 'formcontrolname'
  | 'name'
  | 'aria-label'
  | 'label'
  | 'placeholder'
  | 'routerlink'
  // --- Tier 8: surrounding context --------------------------------------
  | 'context.label_for'
  | 'context.wrapper_label'
  | 'context.fieldset_legend'
  | 'context.preceding_heading'
  | 'context.wrapper_formcontrolname'
  | 'context.aria_labelledby_text'
  // --- Tier 5: i18n / text bindings -------------------------------------
  | 'i18n_key'
  | 'text'
  // --- Tier 4: event-handler names --------------------------------------
  | 'event.click'
  | 'event.change'
  | 'event.submit'
  | 'event.input'
  | 'event.any'
  // --- Tier 1: tooltip / link / image meta ------------------------------
  | 'title'
  | 'href'
  | 'alt'
  // --- Tier 3 / Tier 5b: bindings as semantic keys ----------------------
  | 'bound_identifier'
  | 'bound_text_path'
  // --- Tier 1 cont: low-info fallbacks ---------------------------------
  | 'value'
  | 'type';

/**
 * Priority order per FR-1.6 (extended). The first entry whose extractor
 * returns a non-empty value wins the `primaryKey` slot.
 *
 * Own-element semantic attributes win over surrounding context — when a
 * developer wrote `formControlName="customer"` on the element itself, that's
 * a stronger signal than the wrapping `<h2>Auftraggeber</h2>`.
 */
const PRIORITY: readonly SemanticKey[] = [
  // Tier 0 — own-element
  'formcontrolname',
  'name',
  'aria-label',
  'label',
  'placeholder',
  'routerlink',
  // Tier 8 — surrounding context (kicks in when own attributes are silent)
  'context.label_for',
  'context.wrapper_label',
  'context.fieldset_legend',
  'context.wrapper_formcontrolname',
  'context.preceding_heading',
  'context.aria_labelledby_text',
  // Tier 5 — text bindings
  'i18n_key',
  'text',
  // Tier 4 — event handler names (often the strongest signal on icon buttons)
  'event.click',
  'event.change',
  'event.submit',
  'event.input',
  'event.any',
  // Tier 1 — tooltip / meta
  'title',
  'href',
  'alt',
  // Tier 3 — bound identifier of a known input
  'bound_identifier',
  // Tier 5b — bound text path
  'bound_text_path',
  // Tier 1 — last-resort low-info attributes
  'value',
  'type'
];

export interface SemanticSnapshot {
  // Tier 0
  formcontrolname: string | null;
  name: string | null;
  routerlink: string | null;
  aria_label: string | null;
  placeholder: string | null;
  text_content: string | null;
  type: string | null;
  role: string | null;
  // Tier 1 (extended HTML attrs)
  title: string | null;
  alt: string | null;
  value: string | null;
  html_id: string | null;
  href: string | null;
  src: string | null;
  html_for: string | null;
  label: string | null;
  // Tier 2 — catch-all for everything else statically present
  static_attributes: Record<string, string>;
  // Tier 3 — bound input identifiers (`[data]="currentOrder"`)
  bound_identifiers: Record<string, string>;
  // Tier 4 — event handler function names
  event_handlers: Record<string, string>;
  // Tier 5 — i18n + interpolation property paths
  i18n_keys: string[];
  bound_text_paths: string[];
  // Tier 8 — surrounding context anchors
  context: ContextAnchors;
}

function normalise(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a full semantic snapshot (everything we care about) for the registry.
 * Pure function over (element, parent chain, root) — no side effects.
 */
export function snapshotSemantics(
  element: VisitedElement,
  options: SnapshotOptions = {}
): SemanticSnapshot {
  const parents = options.parents ?? [];
  const rootNodes = options.rootNodes ?? [];
  const excludeAttr = options.attributeName ?? 'data-testid';
  const ctx = resolveContextAnchors(element, parents, rootNodes);

  const tier0FieldSet: ReadonlySet<string> = new Set([
    'formcontrolname',
    'name',
    'routerlink',
    'aria-label',
    'placeholder',
    'type',
    'role',
    // Tier 1 captured separately
    'title',
    'alt',
    'value',
    'id',
    'href',
    'src',
    'for',
    'label',
    // own ID/labelled-by used by context resolver — we still record id but
    // skip the data-testid hint and the `for` attribute outside of <label>
    'aria-labelledby'
  ]);

  const allStatic = getAllStaticAttributes(element, { excludeName: excludeAttr });
  const staticAttributes: Record<string, string> = {};
  for (const [k, v] of allStatic) {
    if (tier0FieldSet.has(k)) continue;
    if (k.startsWith('aria-')) continue; // aria-* is largely structural
    if (k === 'class' || k === 'style' || k === 'tabindex') continue;
    if (k.startsWith('*ng') || k.startsWith('*if') || k === 'ngfor' || k === 'ngif') continue;
    staticAttributes[k] = v;
  }

  const boundIdentifiers: Record<string, string> = {};
  for (const [k, v] of getBoundIdentifiers(element)) boundIdentifiers[k] = v;

  const eventHandlers: Record<string, string> = {};
  for (const [k, v] of getEventHandlerNames(element)) eventHandlers[k] = v;

  const interp = getInterpolationData(element);

  return {
    formcontrolname: normalise(allStatic.get('formcontrolname')),
    name: normalise(allStatic.get('name')),
    routerlink: normalise(allStatic.get('routerlink')),
    aria_label: normalise(allStatic.get('aria-label')),
    placeholder: normalise(allStatic.get('placeholder')),
    text_content: normalise(getStaticTextContent(element)),
    type: normalise(allStatic.get('type')),
    role: normalise(findAttribute(element, 'role')?.value),
    title: normalise(allStatic.get('title')),
    alt: normalise(allStatic.get('alt')),
    value: normalise(allStatic.get('value')),
    html_id: normalise(allStatic.get('id')),
    href: normalise(allStatic.get('href')),
    src: normalise(allStatic.get('src')),
    html_for: normalise(allStatic.get('for')),
    label: normalise(allStatic.get('label')),
    static_attributes: staticAttributes,
    bound_identifiers: boundIdentifiers,
    event_handlers: eventHandlers,
    i18n_keys: interp.i18nKeys,
    bound_text_paths: interp.boundTextPaths,
    context: ctx
  };
}

export interface SnapshotOptions {
  /** Element-parent chain from the document root down to the direct parent. */
  parents?: readonly VisitedElement[];
  /** Top-level template nodes; used by the context resolver for global lookups. */
  rootNodes?: readonly TmplAstNode[];
  /** Attribute name the tagger writes (excluded from static_attributes). */
  attributeName?: string;
}

/**
 * Pull the value the priority list considers for this key, given a fully
 * computed snapshot.
 */
function valueForKey(snap: SemanticSnapshot, key: SemanticKey): string | null {
  switch (key) {
    case 'formcontrolname':
      return snap.formcontrolname;
    case 'name':
      return snap.name;
    case 'aria-label':
      return snap.aria_label;
    case 'label':
      return snap.label;
    case 'placeholder':
      return snap.placeholder;
    case 'routerlink':
      return snap.routerlink;
    case 'context.label_for':
      return snap.context.label_for;
    case 'context.wrapper_label':
      return snap.context.wrapper_label;
    case 'context.fieldset_legend':
      return snap.context.fieldset_legend;
    case 'context.preceding_heading':
      return snap.context.preceding_heading;
    case 'context.wrapper_formcontrolname':
      return snap.context.wrapper_formcontrolname;
    case 'context.aria_labelledby_text':
      return snap.context.aria_labelledby_text;
    case 'i18n_key':
      return snap.i18n_keys[0] ?? null;
    case 'text':
      return snap.text_content;
    case 'event.click':
      return snap.event_handlers.click ?? null;
    case 'event.change':
      return snap.event_handlers.change ?? null;
    case 'event.submit':
      return snap.event_handlers.submit ?? null;
    case 'event.input':
      return snap.event_handlers.input ?? null;
    case 'event.any': {
      // first event in deterministic order
      const keys = Object.keys(snap.event_handlers).sort();
      return keys.length > 0 ? snap.event_handlers[keys[0]!]! : null;
    }
    case 'title':
      return snap.title;
    case 'href':
      return snap.href;
    case 'alt':
      return snap.alt;
    case 'bound_identifier': {
      // pick the most informative bound input deterministically
      const preferredKeys = ['data', 'options', 'value', 'model', 'item', 'items'];
      for (const k of preferredKeys) {
        if (snap.bound_identifiers[k]) return snap.bound_identifiers[k];
      }
      const sortedKeys = Object.keys(snap.bound_identifiers).sort();
      return sortedKeys.length > 0 ? snap.bound_identifiers[sortedKeys[0]!]! : null;
    }
    case 'bound_text_path':
      return snap.bound_text_paths[0] ?? null;
    case 'value':
      return snap.value;
    case 'type':
      return snap.type;
  }
}

/**
 * Build the canonical fingerprint string.
 *
 * Order is fixed by the priority list so reordering attributes in source
 * doesn't change the fingerprint. Catch-all maps (`static_attributes`,
 * `bound_identifiers`, `event_handlers`) are sorted alphabetically by key.
 */
function buildFingerprintString(tag: string, snap: SemanticSnapshot): string {
  const parts: string[] = [tag];

  // Priority-ordered scalar fields
  for (const key of PRIORITY) {
    const v = valueForKey(snap, key);
    if (v !== null) parts.push(`${key}=${v}`);
  }

  // role (outside the priority list, but a stable disambiguator)
  if (snap.role) parts.push(`role=${snap.role}`);

  // i18n_keys/bound_text_paths beyond the first one (the first is already
  // captured via 'i18n_key' / 'bound_text_path')
  if (snap.i18n_keys.length > 1) {
    parts.push(`i18n_keys=${snap.i18n_keys.slice(1).join(',')}`);
  }
  if (snap.bound_text_paths.length > 1) {
    parts.push(`bound_text_paths=${snap.bound_text_paths.slice(1).join(',')}`);
  }

  // static_attributes (sorted), excluding ones already captured by name above
  const consumedAttrs: ReadonlySet<string> = new Set([
    'title',
    'href',
    'alt',
    'value',
    'type'
  ]);
  const staticKeys = Object.keys(snap.static_attributes)
    .filter((k) => !consumedAttrs.has(k))
    .sort();
  for (const k of staticKeys) {
    parts.push(`attr.${k}=${snap.static_attributes[k]}`);
  }

  // bound_identifiers (sorted) - skip the one already chosen as primary
  const boundKeys = Object.keys(snap.bound_identifiers).sort();
  for (const k of boundKeys) {
    parts.push(`bound.${k}=${snap.bound_identifiers[k]}`);
  }

  // event_handlers (sorted) - all of them, even the one chosen as primary,
  // because the *set* of handlers is part of identity (a button with both
  // click and dblclick is not the same as one with just click)
  const eventKeys = Object.keys(snap.event_handlers).sort();
  for (const k of eventKeys) {
    parts.push(`on.${k}=${snap.event_handlers[k]}`);
  }

  return parts.join('|');
}

/** Compute the fingerprint for an element (FR-1.6). */
export function generateFingerprint(
  element: VisitedElement,
  options: SnapshotOptions = {}
): Fingerprint {
  const tag = getTagName(element).toLowerCase();
  const semantic = snapshotSemantics(element, options);

  let primaryKey: SemanticKey | null = null;
  let primaryValue: string | null = null;
  for (const key of PRIORITY) {
    const v = valueForKey(semantic, key);
    if (v !== null && v.length > 0) {
      primaryKey = key;
      primaryValue = v;
      break;
    }
  }

  return {
    fingerprint: buildFingerprintString(tag, semantic),
    primaryKey,
    primaryValue,
    semantic
  };
}
