// Fingerprint extraction. Deterministic: no paths, no times.

import {
  findAttribute,
  getAllStaticAttributes,
  getBoundIdentifiers,
  getChildShape,
  getCssClasses,
  getEventHandlerNames,
  getInterpolationData,
  getStaticTextContent,
  getStructuralDirectives,
  getTagName,
  resolveContextAnchors,
  type BlockContext,
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
  | 'html_id'
  | 'formcontrolname'
  | 'name'
  | 'aria-label'
  | 'label'
  | 'placeholder'
  | 'routerlink'
  | 'context.label_for'
  | 'context.wrapper_label'
  | 'context.fieldset_legend'
  | 'context.preceding_heading'
  | 'context.wrapper_formcontrolname'
  | 'context.aria_labelledby_text'
  | 'i18n_key'
  | 'text'
  | 'event.click'
  | 'event.change'
  | 'event.submit'
  | 'event.input'
  | 'event.any'
  | 'title'
  | 'href'
  | 'alt'
  | 'bound_identifier'
  | 'bound_text_path'
  | 'structural_directive'
  | 'value'
  | 'type'
  | 'role'
  | 'css_class'
  | 'child_shape';

/**
 * Priority order: the first entry whose extractor returns a non-empty
 * value wins the `primaryKey` slot. Own-element semantic attributes
 * outrank surrounding context, which outranks generic fallbacks like
 * raw text and CSS classes.
 */
const PRIORITY: readonly SemanticKey[] = [
  'formcontrolname',
  'name',
  'aria-label',
  'label',
  'placeholder',
  'routerlink',
  'context.label_for',
  'context.wrapper_label',
  'context.fieldset_legend',
  'context.wrapper_formcontrolname',
  'context.preceding_heading',
  'context.aria_labelledby_text',
  'i18n_key',
  'text',
  'event.click',
  'event.change',
  'event.submit',
  'event.input',
  'event.any',
  'title',
  'href',
  'alt',
  'bound_identifier',
  'bound_text_path',
  'structural_directive',
  'value',
  'type',
  'role',
  // `html_id` is page-unique by spec, so it's a guaranteed disambiguator -
  // but `id` values are often cryptic slugs (`cust-dd`) less readable than
  // a `<label>` text or aria-label. Placed near the bottom so a meaningful
  // semantic field wins the readable `{key}` slot whenever one exists, but
  // html_id still kills any remaining collision through the fingerprint.
  'html_id',
  'css_class',
  'child_shape'
];

export interface SemanticSnapshot {
  formcontrolname: string | null;
  name: string | null;
  routerlink: string | null;
  aria_label: string | null;
  placeholder: string | null;
  text_content: string | null;
  type: string | null;
  role: string | null;
  title: string | null;
  alt: string | null;
  value: string | null;
  html_id: string | null;
  href: string | null;
  src: string | null;
  html_for: string | null;
  label: string | null;
  /** Catch-all for any other static attribute (`severity`, `variant`, ...). */
  static_attributes: Record<string, string>;
  /** Identifier paths read by bound inputs (`[data]="currentOrder"` to `currentOrder`). */
  bound_identifiers: Record<string, string>;
  /** Function names invoked by event handlers (`(click)="saveOrder()"` to `saveOrder`). */
  event_handlers: Record<string, string>;
  /** String literals fed into `translate`/`transloco`/`t`/`i18n` pipes. */
  i18n_keys: string[];
  /** Property paths read via `{{ … }}` interpolations. */
  bound_text_paths: string[];
  /** Class tokens of the element, lowercased + sorted + deduplicated. */
  css_classes: string[];
  /** Anchors collected by walking up to the nearest section boundary. */
  context: ContextAnchors;
  /** Structural directives lifted from the synthetic `<ng-template>` parent. */
  structural_directives: Record<string, string>;
  /** Tag names of immediate element-like children, in source order. */
  child_shape: string[];
}

function normalise(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Build a full semantic snapshot (everything we care about) for the registry.
 * Pure function over (element, parent chain, root) - no side effects.
 */
export function snapshotSemantics(
  element: VisitedElement,
  options: SnapshotOptions = {}
): SemanticSnapshot {
  const parents = options.parents ?? [];
  const rootNodes = options.rootNodes ?? [];
  const excludeAttr = options.attributeName ?? 'data-testid';
  const ctx = resolveContextAnchors(element, parents, rootNodes);

  // Static attributes captured into named scalar fields below - anything
  // that lands here as a key is excluded from the catch-all bucket so it
  // isn't represented twice in the fingerprint.
  const namedStaticFields: ReadonlySet<string> = new Set([
    'formcontrolname',
    'name',
    'routerlink',
    'aria-label',
    'placeholder',
    'type',
    'role',
    'title',
    'alt',
    'value',
    'id',
    'href',
    'src',
    'for',
    'label',
    'aria-labelledby'
  ]);

  const allStatic = getAllStaticAttributes(element, { excludeName: excludeAttr });
  const staticAttributes: Record<string, string> = {};
  for (const [k, v] of allStatic) {
    if (namedStaticFields.has(k)) continue;
    if (k.startsWith('aria-')) continue; // aria-* is structural, not identity
    // class is captured as a sorted set of its own; style/tabindex are pure
    // presentation, not identity.
    if (k === 'class' || k === 'style' || k === 'tabindex') continue;
    // *ng* attributes get rewritten onto a synthetic Template parent and
    // shouldn't reach this path - skip defensively.
    if (k.startsWith('*ng') || k.startsWith('*if') || k === 'ngfor' || k === 'ngif') continue;
    staticAttributes[k] = v;
  }

  const boundIdentifiers: Record<string, string> = {};
  for (const [k, v] of getBoundIdentifiers(element)) boundIdentifiers[k] = v;

  const eventHandlers: Record<string, string> = {};
  for (const [k, v] of getEventHandlerNames(element)) eventHandlers[k] = v;

  const interp = getInterpolationData(element);
  const cssClasses = getCssClasses(element);
  const childShape = getChildShape(element);

  const structuralDirectives: Record<string, string> = {};
  for (const [k, v] of getStructuralDirectives(parents, options.blockContext ?? [])) {
    structuralDirectives[k] = v;
  }

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
    css_classes: cssClasses,
    context: ctx,
    structural_directives: structuralDirectives,
    child_shape: childShape
  };
}

export interface SnapshotOptions {
  /** Element-parent chain from the document root down to the direct parent. */
  parents?: readonly VisitedElement[];
  /** Top-level template nodes; used by the context resolver for global lookups. */
  rootNodes?: readonly TmplAstNode[];
  /** Attribute name the tagger writes (excluded from static_attributes). */
  attributeName?: string;
  /**
   * When true, utility-shaped class names (Tailwind `mt-4`, `flex`, ...) are
   * eligible to win the `css_class` primary-key slot. The fingerprint string
   * always includes every class regardless - this flag only controls primary-
   * key selection (which drives the readable `{key}` segment of the testid
   * and the locator variable name).
   */
  includeUtilityClasses?: boolean;
  /**
   * Stack of Angular 17+ control-flow block branches enclosing the element.
   * Provided by `walkElements`. Folded into `structural_directives` so two
   * elements in different `@if`/`@switch`/`@defer` branches don't collide
   * just because the block keyword isn't visible in the parent chain.
   */
  blockContext?: BlockContext;
}

/**
 * Pull the value the priority list considers for this key, given a fully
 * computed snapshot.
 */
function valueForKey(
  snap: SemanticSnapshot,
  key: SemanticKey,
  options: { includeUtilityClasses?: boolean } = {}
): string | null {
  switch (key) {
    case 'html_id':
      return snap.html_id;
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
    case 'structural_directive': {
      // Prefer the most semantically loaded directives first.
      const ordered = ['ngif', 'ngifelse', 'ngfor', 'ngforof', 'ngswitchcase', 'ngswitchdefault'];
      for (const k of ordered) {
        const v = snap.structural_directives[k];
        if (v && v !== '<expr>') return v;
      }
      // Anything else, alphabetically first non-marker value.
      const keys = Object.keys(snap.structural_directives).sort();
      for (const k of keys) {
        const v = snap.structural_directives[k];
        if (v && v !== '<expr>') return v;
      }
      return null;
    }
    case 'value':
      return snap.value;
    case 'type':
      return snap.type;
    case 'role':
      return snap.role;
    case 'css_class': {
      // Prefer a non-utility class so `mt-4` doesn't rank ahead of
      // `card-error` on Tailwind-heavy pages. If every class looks like a
      // utility, fall back to the first one anyway. Opt-out via
      // `includeUtilityClasses` for codebases that intentionally use Tailwind
      // class names as identity markers.
      if (options.includeUtilityClasses) {
        return snap.css_classes[0] ?? null;
      }
      for (const c of snap.css_classes) {
        if (!isLikelyUtilityClass(c)) return c;
      }
      return snap.css_classes[0] ?? null;
    }
    case 'child_shape': {
      // Two structurally-identical wrappers around different content
      // (button-vs-input, span-then-icon vs icon-then-span) get different
      // child shapes. Joined with `-` so the resulting key reads naturally
      // in the testid (`row--span-button`).
      if (snap.child_shape.length === 0) return null;
      return snap.child_shape.join('-');
    }
  }
}

/**
 * Heuristic for "this looks like a Tailwind / utility class, not a
 * semantic one". Used only to demote utility classes when picking the
 * `css_class` primary key - utility classes still go into the fingerprint
 * string for full disambiguation.
 */
function isLikelyUtilityClass(cls: string): boolean {
  if (/^(m|mx|my|mt|mb|ml|mr|p|px|py|pt|pb|pl|pr|w|h|min|max|gap|space|inset|top|left|right|bottom|z|order)-/.test(cls)) return true;
  if (/^(text|bg|border|ring|shadow|font|leading|tracking|rounded|opacity|cursor|outline)-/.test(cls)) return true;
  if (/^(flex|grid|block|inline|hidden|visible|absolute|relative|fixed|sticky|static)$/.test(cls)) return true;
  if (/^(items|justify|content|self|place)-/.test(cls)) return true;
  if (/^(sm|md|lg|xl|2xl):/.test(cls)) return true;
  if (/^col-|^row-/.test(cls)) return true;
  return false;
}

/**
 * Build the canonical fingerprint string.
 *
 * Order is fixed by the priority list so reordering attributes in source
 * doesn't change the fingerprint. Catch-all maps (`static_attributes`,
 * `bound_identifiers`, `event_handlers`) are sorted alphabetically by key.
 */
function buildFingerprintString(
  tag: string,
  snap: SemanticSnapshot,
  options: { includeUtilityClasses?: boolean } = {}
): string {
  const parts: string[] = [tag];

  // Priority-ordered scalar fields. `role` and `child_shape` are now part of
  // the priority list, so no separate emit blocks are needed for them.
  for (const key of PRIORITY) {
    const v = valueForKey(snap, key, options);
    if (v !== null) parts.push(`${key}=${v}`);
  }

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

  // CSS classes - sorted set, joined. Includes utility classes; for plain
  // wrappers the class string is often the only available signal.
  if (snap.css_classes.length > 0) {
    parts.push(`class=${snap.css_classes.join(' ')}`);
  }

  // Structural directives carried by the parent <ng-template> wrapper.
  // Sorted so two siblings with the same condition collide intentionally
  // while differing conditions disambiguate.
  const structKeys = Object.keys(snap.structural_directives).sort();
  for (const k of structKeys) {
    parts.push(`struct.${k}=${snap.structural_directives[k]}`);
  }

  return parts.join('|');
}

/** Compute the fingerprint for an element. */
export function generateFingerprint(
  element: VisitedElement,
  options: SnapshotOptions = {}
): Fingerprint {
  const tag = getTagName(element).toLowerCase();
  const semantic = snapshotSemantics(element, options);
  const valueOpts = { includeUtilityClasses: options.includeUtilityClasses };

  let primaryKey: SemanticKey | null = null;
  let primaryValue: string | null = null;
  for (const key of PRIORITY) {
    const v = valueForKey(semantic, key, valueOpts);
    if (v !== null && v.length > 0) {
      primaryKey = key;
      primaryValue = v;
      break;
    }
  }

  return {
    fingerprint: buildFingerprintString(tag, semantic, valueOpts),
    primaryKey,
    primaryValue,
    semantic
  };
}
