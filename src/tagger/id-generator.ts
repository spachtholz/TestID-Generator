/**
 * Deterministic data-testid generator (FR-1.7, FR-1.9, NFR-3).
 *
 * Default format: `{component}__{element}--{key}{hash:-}`
 *
 * Users can override the shape via the `idFormat` config option. Supported
 * placeholders:
 *
 *   {component}   kebab component name, e.g. `order-form`
 *   {element}     canonical short element type (`input`, `button`, ...)
 *   {key}         primary fingerprint value (kebab), or tag when unavailable
 *   {tag}         raw tag name (kebab)
 *   {hash}        hash digest when a collision forces disambiguation (empty otherwise)
 *   {hash:-}      same as {hash} but prefixed with `-` when non-empty
 *
 * Unknown placeholders render literally. The default format is identical to
 * the pre-0.2.0 hard-coded shape, so existing registries are unaffected.
 */

import { createHash } from 'node:crypto';
import type { ElementTypeShort } from './element-detector.js';

export type HashAlgorithm = 'sha256' | 'sha1' | 'md5';

export const DEFAULT_ID_FORMAT = '{component}__{element}--{key}{hash:-}';

export interface GenerateIdInput {
  /** Component short name, e.g. `order-form`. */
  componentName: string;
  /** Canonical short element type. */
  elementType: ElementTypeShort;
  /** Primary fingerprint value (e.g. `customer`) or null when unavailable. */
  primaryValue: string | null;
  /** Tag name, used as a semantic-key fallback. */
  tag: string;
  /** Full fingerprint string (used for deterministic hashing). */
  fingerprint: string;
  /**
   * Pass true when this ID collides with another already-generated one in the
   * same component — the hash suffix is then appended to disambiguate.
   */
  needsHashSuffix: boolean;
  /** Hash length to append (default 6). */
  hashLength?: number;
  /** Hash algorithm (default `sha256`). */
  hashAlgorithm?: HashAlgorithm;
  /** Template string (default: {@link DEFAULT_ID_FORMAT}). */
  idFormat?: string;
}

/**
 * Kebab-case a string per the FR-1.7 slug rules.
 *
 *   - Lowercase.
 *   - Non-alphanumeric characters collapsed to `-`.
 *   - Multiple dashes collapsed to one, leading/trailing dashes stripped.
 *
 * Empty string falls back to `"unknown"` so we never emit IDs like `--`.
 */
export function kebab(input: string): string {
  if (!input) return 'unknown';
  // insert dashes at camelCase boundaries first
  const withBoundaries = input
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  const slug = withBoundaries
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'unknown';
}

/** Derive a component short name from a template file path. */
export function componentNameFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  // drop trailing .component.html / .html / .template.html
  const stripped = base
    .replace(/\.component\.html$/i, '')
    .replace(/\.template\.html$/i, '')
    .replace(/\.html$/i, '');
  return kebab(stripped);
}

/** Hash the fingerprint, returning the first `length` hex chars. */
export function hashFingerprint(
  fingerprint: string,
  length = 6,
  algorithm: HashAlgorithm = 'sha256'
): string {
  return createHash(algorithm).update(fingerprint, 'utf8').digest('hex').slice(0, length);
}

/** Generate the data-testid string. */
export function generateId(input: GenerateIdInput): string {
  const { componentName, elementType, primaryValue, tag, fingerprint } = input;
  const hashLength = input.hashLength ?? 6;
  const hashAlgorithm = input.hashAlgorithm ?? 'sha256';
  const format = input.idFormat ?? DEFAULT_ID_FORMAT;

  const hash = input.needsHashSuffix
    ? hashFingerprint(fingerprint, hashLength, hashAlgorithm)
    : '';
  const values: Record<string, string> = {
    component: kebab(componentName),
    element: elementType,
    key: primaryValue ? kebab(primaryValue) : kebab(tag),
    tag: kebab(tag),
    hash,
    'hash:-': hash ? `-${hash}` : ''
  };
  return renderIdTemplate(format, values);
}

/**
 * Substitute `{placeholder}` occurrences in the format string. Unknown names
 * render literally (so users can include `{}` in their testids intentionally,
 * though that is rarely useful).
 */
function renderIdTemplate(format: string, values: Record<string, string>): string {
  return format.replace(/\{([^{}]+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : match;
  });
}
