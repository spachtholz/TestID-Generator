// Collects and formats warnings about unresolvable id collisions: either the
// configured idFormat has no hash placeholder, or two elements share an
// identical fingerprint. In both cases the duplicate elements end up with the
// same testid - functional, but worth surfacing.

export type CollisionReason =
  | 'no-hash-placeholder'
  | 'identical-fingerprint'
  | 'collision-group-size-changed';

export interface CollisionWarning {
  /** Component-relative path passed in by the tagger. */
  componentPath: string;
  line: number;
  column: number;
  /** The shared testid emitted on every duplicate. */
  id: string;
  /** Tag name of the offending element. */
  tag: string;
  reason: CollisionReason;
  /**
   * Full fingerprint string of the colliding element. Two elements with the
   * same fingerprint will produce the same testid even with hash-suffix; the
   * fingerprint is the artifact that needs to differ.
   */
  fingerprint: string;
  /** Snapshot of all extracted semantic data — used by the diagnostic dump. */
  semantic?: Record<string, unknown>;
  /** Set only for 'collision-group-size-changed' so the formatter can tell. */
  previousGroupSize?: number;
  currentGroupSize?: number;
}

export interface FormatOptions {
  /** Max individual warnings to print before switching to a count summary. */
  limit?: number;
}

const DEFAULT_LIMIT = 20;

export function formatCollisionWarnings(
  warnings: readonly CollisionWarning[],
  options: FormatOptions = {}
): string {
  if (warnings.length === 0) return '';
  const limit = options.limit ?? DEFAULT_LIMIT;

  const lines: string[] = [];
  lines.push(
    `[testid-tagger] ${warnings.length} unresolvable collision(s): duplicate element(s) share a testid.`
  );
  lines.push(
    `  This is functional - tests can target by container/index - but a semantic differentiator (aria-label, formcontrolname, name, distinct text) would make ids unique.`
  );

  const shown = warnings.slice(0, limit);
  for (const w of shown) {
    const why = formatReason(w);
    lines.push(
      `  - ${w.componentPath}:${w.line}:${w.column}  <${w.tag}> id="${w.id}"  (${why})`
    );
  }
  if (warnings.length > shown.length) {
    lines.push(`  ... and ${warnings.length - shown.length} more`);
  }
  return lines.join('\n') + '\n';
}

function formatReason(w: CollisionWarning): string {
  switch (w.reason) {
    case 'no-hash-placeholder':
      return 'idFormat has no {hash}/{hash:-} slot';
    case 'identical-fingerprint':
      return 'identical fingerprint';
    case 'collision-group-size-changed':
      return `collision group size changed (${w.previousGroupSize ?? '?'} -> ${w.currentGroupSize ?? '?'}); surviving mapping is heuristic`;
  }
}
