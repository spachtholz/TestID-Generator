/**
 * Deterministic JSON canonicalization (NFR-3).
 *
 * Sorts object keys alphabetically at every depth so that two structurally
 * equal objects always serialize to byte-identical JSON. Used by every writer
 * that persists state to disk — registry, diff reports — so hash-based
 * change detection in CI pipelines stays reliable.
 *
 * Array order is preserved (arrays are sequences, not sets).
 */

export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalizeJson(obj[key]);
    }
    return out;
  }
  return value;
}
