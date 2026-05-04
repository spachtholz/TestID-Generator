// Shared template + slug helpers used by both the id generator and the
// locator variable-name builder.

/**
 * Map non-ASCII characters to ASCII equivalents *before* the regex strip in
 * `kebab()` so that German umlauts and other common Latin diacritics
 * survive as readable letters instead of becoming `-`.
 *
 * - `ä/ö/ü/Ä/Ö/Ü` → `ae/oe/ue` (German convention, not bare `a/o/u`)
 * - `ß` → `ss`
 * - everything else with a Latin base (`é`, `ñ`, `ç`, ...) → its base letter
 *   via `NFD`-decomposition + diacritic strip
 */
function transliterate(input: string): string {
  let out = '';
  for (const ch of input) {
    switch (ch) {
      case 'ä': out += 'ae'; continue;
      case 'ö': out += 'oe'; continue;
      case 'ü': out += 'ue'; continue;
      case 'Ä': out += 'Ae'; continue;
      case 'Ö': out += 'Oe'; continue;
      case 'Ü': out += 'Ue'; continue;
      case 'ß': out += 'ss'; continue;
      case 'ẞ': out += 'SS'; continue;
    }
    // Strip combining diacritics for everything else (é, ñ, ç, ...).
    const decomposed = ch.normalize('NFD').replace(/\p{M}/gu, '');
    out += decomposed;
  }
  return out;
}

export function kebab(input: string): string {
  if (!input) return 'unknown';
  const ascii = transliterate(input);
  const withBoundaries = ascii
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2');
  const slug = withBoundaries
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'unknown';
}

/** Substitute `{placeholder}` occurrences. Unknown placeholders render literally. */
export function renderIdTemplate(
  format: string,
  values: Record<string, string>
): string {
  return format.replace(/\{([^{}]+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : match;
  });
}

/** True when the format contains either `{name}` or `{name:<sep>}`. */
export function formatHasPlaceholder(format: string, name: string): boolean {
  const re = new RegExp(`\\{${name}(:[^}]*)?\\}`);
  return re.test(format);
}
