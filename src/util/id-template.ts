// Shared template + slug helpers used by both the id generator and the
// locator variable-name builder.

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

/** Substitute `{placeholder}` occurrences. Unknown placeholders render literally. */
export function renderIdTemplate(
  format: string,
  values: Record<string, string>
): string {
  return format.replace(/\{([^{}]+)\}/g, (match, name) => {
    return Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : match;
  });
}
