// Fingerprint extraction (FR-1.6, FR-1.9). Deterministic: no paths, no times.

import {
  findAttribute,
  getStaticTextContent,
  getTagName,
  type VisitedElement
} from './template-parser.js';

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
  | 'formcontrolname'
  | 'name'
  | 'routerlink'
  | 'aria-label'
  | 'placeholder'
  | 'text'
  | 'type';

/**
 * Priority order per FR-1.6. The first entry whose extractor returns a
 * non-empty value wins the `primaryKey` slot.
 */
const PRIORITY: readonly SemanticKey[] = [
  'formcontrolname',
  'name',
  'routerlink',
  'aria-label',
  'placeholder',
  'text',
  'type'
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
}

function normalise(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extract(element: VisitedElement, key: SemanticKey): string | null {
  switch (key) {
    case 'formcontrolname':
      return normalise(findAttribute(element, 'formcontrolname')?.value);
    case 'name':
      return normalise(findAttribute(element, 'name')?.value);
    case 'routerlink':
      return normalise(findAttribute(element, 'routerlink')?.value);
    case 'aria-label':
      return normalise(findAttribute(element, 'aria-label')?.value);
    case 'placeholder':
      return normalise(findAttribute(element, 'placeholder')?.value);
    case 'text':
      return normalise(getStaticTextContent(element));
    case 'type':
      return normalise(findAttribute(element, 'type')?.value);
  }
}

/** Build a full semantic snapshot (everything we care about) for the registry. */
export function snapshotSemantics(element: VisitedElement): SemanticSnapshot {
  return {
    formcontrolname: extract(element, 'formcontrolname'),
    name: extract(element, 'name'),
    routerlink: extract(element, 'routerlink'),
    aria_label: extract(element, 'aria-label'),
    placeholder: extract(element, 'placeholder'),
    text_content: extract(element, 'text'),
    type: extract(element, 'type'),
    role: normalise(findAttribute(element, 'role')?.value)
  };
}

/** Compute the fingerprint for an element (FR-1.6). */
export function generateFingerprint(element: VisitedElement): Fingerprint {
  const tag = getTagName(element).toLowerCase();
  const semantic = snapshotSemantics(element);

  let primaryKey: SemanticKey | null = null;
  let primaryValue: string | null = null;
  for (const key of PRIORITY) {
    const v = extract(element, key);
    if (v) {
      primaryKey = key;
      primaryValue = v;
      break;
    }
  }

  // Build deterministic fingerprint: tag|field=value|field=value…
  // We include every present field (primary or not) - order is fixed by PRIORITY.
  const parts: string[] = [tag];
  for (const key of PRIORITY) {
    const v = extract(element, key);
    if (v) {
      parts.push(`${key}=${v}`);
    }
  }
  // role is fingerprinted too (outside the priority list) so that two
  // otherwise-identical elements with different roles disambiguate.
  if (semantic.role) {
    parts.push(`role=${semantic.role}`);
  }

  return {
    fingerprint: parts.join('|'),
    primaryKey,
    primaryValue,
    semantic
  };
}
