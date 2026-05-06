// Sorted-key JSON so equal state produces byte-equal output.
// Arrays are sequences, order is preserved.

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
