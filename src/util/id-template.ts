/**
 * Shared template-string substitution + slug helpers used by both the id
 * generator (FR-1.7) and the locator variable-name builder (FR-4.x).
 *
 * Kept in `util/` rather than duplicated per module so a refactor to the
 * placeholder syntax only touches one file, and both callers stay byte-for-byte
 * compatible with each other's slug rules.
 */

/**
 * Kebab-case a string per the FR-1.7 slug rules.
 *
 *   - Lowercase.
 *   - CamelCase boundaries preserved (inserts `-` between `a|B`, `AB|Cd`).
 *   - Non-alphanumeric characters collapsed to `-`.
 *   - Multiple dashes collapsed to one, leading/trailing dashes stripped.
 *
 * Empty string falls back to `"unknown"` so we never emit IDs like `--`.
 */
export function kebab(input: string): string {
  if (!input) return 'unknown';
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

/**
 * Substitute `{placeholder}` occurrences in the format string. Unknown names
 * render literally (so users can include `{}` in their output intentionally,
 * though that is rarely useful).
 */
export function renderIdTemplate(
  format: string,
  values: Record<string, string>
): string {
  return format.replace(/\{([^{}]+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : match;
  });
}
