/**
 * Similarity scoring.
 *
 * We compute similarity between two registry entries by Levenshtein-distance
 * over a deterministic serialisation of their semantic attributes. A score of
 * 1.0 means the serialisations are identical; 0.0 means they share no
 * characters.
 */

import type { RegistryEntry, SemanticAttributes } from '../registry/index.js';

/** Classic iterative two-row Levenshtein distance (O(n*m) time, O(min) space). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Always iterate over the shorter string in the inner loop for memory.
  let s1 = a;
  let s2 = b;
  if (s1.length > s2.length) {
    [s1, s2] = [s2, s1];
  }

  const n = s1.length;
  let prev: number[] = new Array<number>(n + 1);
  let curr: number[] = new Array<number>(n + 1);
  for (let i = 0; i <= n; i++) prev[i] = i;

  for (let j = 1; j <= s2.length; j++) {
    curr[0] = j;
    const s2j = s2.charCodeAt(j - 1);
    for (let i = 1; i <= n; i++) {
      const cost = s1.charCodeAt(i - 1) === s2j ? 0 : 1;
      const del = (prev[i] ?? 0) + 1;
      const ins = (curr[i - 1] ?? 0) + 1;
      const sub = (prev[i - 1] ?? 0) + cost;
      curr[i] = Math.min(del, ins, sub);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

/** Normalised similarity in [0, 1]. */
export function similarityScore(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Serialise semantic attributes into a stable, canonical string. Keys are
 * sorted alphabetically so two snapshots with the same fields always produce
 * the same string regardless of object-key insertion order.
 *
 * Sub-objects (`event_handlers`, `bound_identifiers`, `static_attributes`,
 * `context`, `structural_directives`) are flattened to dotted paths
 * (`event_handlers.click=saveAddress`) so a Levenshtein comparison actually
 * sees those values - the previous implementation stringified them as
 * `[object Object]`, which collapsed rename-detection precisely for the
 * fields that distinguish two similar-but-not-identical buttons (different
 * click handlers, severity attrs, fieldset legends, …).
 */
export function serializeSemantics(semantic: SemanticAttributes): string {
  const parts: string[] = [];
  flatten(semantic as Record<string, unknown>, '', parts);
  parts.sort();
  return parts.join('|');
}

function flatten(
  value: unknown,
  prefix: string,
  out: string[]
): void {
  if (value == null) return;
  if (Array.isArray(value)) {
    if (value.length === 0) return;
    // Stringify in source order - many list-shaped fields (child_shape,
    // bound_text_paths) carry semantic meaning in their ordering.
    out.push(`${prefix}=${value.map((v) => stringifyScalar(v)).join(',')}`);
    return;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    for (const k of keys) {
      const child = obj[k];
      if (child == null) continue;
      const childPrefix = prefix.length === 0 ? k : `${prefix}.${k}`;
      flatten(child, childPrefix, out);
    }
    return;
  }
  // Scalar - string, number, boolean.
  if (value === '') return;
  out.push(`${prefix}=${stringifyScalar(value)}`);
}

function stringifyScalar(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    // Defensive: nested arrays/objects inside an array element. Render as
    // sorted JSON so similarity isn't ordering-sensitive there either.
    try {
      return JSON.stringify(v, Object.keys(v as object).sort());
    } catch {
      return '';
    }
  }
  return String(v);
}

/** Compute similarity between two registry entries. */
export function entrySimilarity(a: RegistryEntry, b: RegistryEntry): number {
  const sa = serializeSemantics(a.semantic);
  const sb = serializeSemantics(b.semantic);
  const semanticScore = similarityScore(sa, sb);
  // Small bonus when tags match (tag equivalence is a strong signal).
  const tagBonus = a.tag === b.tag ? 0.05 : 0;
  // Clamp to 1.0
  return Math.min(1, semanticScore + tagBonus);
}
