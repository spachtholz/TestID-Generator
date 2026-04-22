// Collects and formats warnings about statically tagged elements sitting
// inside a loop context (*ngFor, @for, PrimeNG body/item templates).

import type { LoopContext } from './template-parser.js';

export interface LoopWarning {
  /** Component-relative path passed in by the tagger. */
  componentPath: string;
  line: number;
  column: number;
  /** The static testid the tagger assigned. */
  id: string;
  /** Tag name of the offending element. */
  tag: string;
  loop: LoopContext;
}

export interface FormatOptions {
  /** Max individual warnings to print before switching to a count summary. */
  limit?: number;
}

const DEFAULT_LIMIT = 20;

export function formatLoopWarnings(
  warnings: readonly LoopWarning[],
  options: FormatOptions = {}
): string {
  if (warnings.length === 0) return '';
  const limit = options.limit ?? DEFAULT_LIMIT;

  const lines: string[] = [];
  lines.push(
    `[testid-tagger] ${warnings.length} loop warning(s): static testid inside a loop means every iteration shares the same id.`
  );
  lines.push(`  Fix by adding [attr.data-testid]="'prefix--' + item.id" on the affected element.`);

  const shown = warnings.slice(0, limit);
  for (const w of shown) {
    lines.push(
      `  - ${w.componentPath}:${w.line}:${w.column}  <${w.tag}> in ${w.loop.label}  id="${w.id}"`
    );
  }
  if (warnings.length > shown.length) {
    lines.push(`  ... and ${warnings.length - shown.length} more`);
  }
  return lines.join('\n') + '\n';
}
