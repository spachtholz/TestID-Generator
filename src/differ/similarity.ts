/**
 * Similarity scoring (FR-3.4).
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
 */
export function serializeSemantics(semantic: SemanticAttributes): string {
  const keys = Object.keys(semantic).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = semantic[key];
    if (v != null && v !== '') {
      parts.push(`${key}=${v}`);
    }
  }
  return parts.join('|');
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
