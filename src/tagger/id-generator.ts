// Deterministic id generator. Placeholders: {component}, {element}, {key},
// {tag}, {hash}, {hash:-}. Unknown placeholders render as-is.

import { createHash } from 'node:crypto';
import { kebab, renderIdTemplate } from '../util/id-template.js';
import type { ElementTypeShort } from './element-detector.js';

export { kebab } from '../util/id-template.js';

export type HashAlgorithm = 'sha256' | 'sha1' | 'md5';

export const DEFAULT_ID_FORMAT = '{component}__{element}--{key}{disambiguator:--}{hash:-}';

export interface GenerateIdInput {
  componentName: string;
  elementType: ElementTypeShort;
  primaryValue: string | null;
  tag: string;
  fingerprint: string;
  /** true = append hash suffix for disambiguation */
  needsHashSuffix: boolean;
  /**
   * Sibling-index disambiguator value (e.g. `2`). When set, fills the
   * `{disambiguator}` / `{disambiguator:--}` placeholders. Empty string =
   * unique enough already, render the slot empty.
   */
  disambiguator?: string;
  hashLength?: number;
  hashAlgorithm?: HashAlgorithm;
  idFormat?: string;
}

export function componentNameFromPath(filePath: string): string {
  const base = filePath.split(/[\\/]/).pop() ?? filePath;
  const stripped = base
    .replace(/\.component\.html$/i, '')
    .replace(/\.template\.html$/i, '')
    .replace(/\.html$/i, '');
  return kebab(stripped);
}

export function hashFingerprint(
  fingerprint: string,
  length = 6,
  algorithm: HashAlgorithm = 'sha256'
): string {
  return createHash(algorithm).update(fingerprint, 'utf8').digest('hex').slice(0, length);
}

export function generateId(input: GenerateIdInput): string {
  const { componentName, elementType, primaryValue, tag, fingerprint } = input;
  const hashLength = input.hashLength ?? 6;
  const hashAlgorithm = input.hashAlgorithm ?? 'sha256';
  const format = input.idFormat ?? DEFAULT_ID_FORMAT;

  const hash = input.needsHashSuffix
    ? hashFingerprint(fingerprint, hashLength, hashAlgorithm)
    : '';
  const disambiguator = input.disambiguator ?? '';
  const values: Record<string, string> = {
    component: kebab(componentName),
    element: elementType,
    key: primaryValue ? kebab(primaryValue) : kebab(tag),
    tag: kebab(tag),
    hash,
    'hash:-': hash ? `-${hash}` : '',
    disambiguator,
    'disambiguator:--': disambiguator ? `--${disambiguator}` : ''
  };
  return renderIdTemplate(format, values);
}

