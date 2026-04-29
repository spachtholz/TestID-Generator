// Component-name resolution for the locator generator.
// Decides what label drives `{component}` and the .py filename when several
// templates share a basename (typical in monorepos with apps/{name}/...).

import { componentSlug } from './render.js';

export type ComponentNamingMode = 'basename' | 'basename-strict' | 'disambiguate';

export interface ResolvedComponentNames {
  /** componentPath -> resolved label (already slug-style, dashes preserved) */
  labels: Map<string, string>;
  /** basenames that had >1 path under them in this run */
  collisions: { basename: string; paths: string[] }[];
}

export function resolveComponentNames(
  componentPaths: readonly string[],
  mode: ComponentNamingMode
): ResolvedComponentNames {
  const byBasename = new Map<string, string[]>();
  for (const p of componentPaths) {
    const base = componentSlug(p);
    const list = byBasename.get(base) ?? [];
    list.push(p);
    byBasename.set(base, list);
  }

  const labels = new Map<string, string>();
  const collisions: { basename: string; paths: string[] }[] = [];

  for (const [base, group] of byBasename) {
    if (group.length === 1) {
      labels.set(group[0]!, base);
      continue;
    }
    collisions.push({ basename: base, paths: [...group] });

    if (mode === 'basename') {
      for (const p of group) labels.set(p, base);
      continue;
    }
    if (mode === 'basename-strict') {
      throw new Error(
        `Component-name collision on "${base}":\n  ${group.join('\n  ')}\n` +
          `Pass componentNaming: 'disambiguate' (or rename one of the templates).`
      );
    }
    const disambiguated = disambiguateGroup(group, base);
    for (const [p, label] of disambiguated) labels.set(p, label);
  }

  return { labels, collisions };
}

function disambiguateGroup(group: readonly string[], base: string): Map<string, string> {
  const segArrays = group.map((p) => p.split(/[\\/]/));
  const minLen = Math.min(...segArrays.map((s) => s.length));

  let commonSuffixLen = 0;
  while (commonSuffixLen < minLen) {
    const seg = segArrays[0]![segArrays[0]!.length - 1 - commonSuffixLen];
    const allMatch = segArrays.every(
      (s) => s[s.length - 1 - commonSuffixLen] === seg
    );
    if (!allMatch) break;
    commonSuffixLen++;
  }

  let commonPrefixLen = 0;
  while (commonPrefixLen < minLen - commonSuffixLen) {
    const seg = segArrays[0]![commonPrefixLen];
    const allMatch = segArrays.every((s) => s[commonPrefixLen] === seg);
    if (!allMatch) break;
    commonPrefixLen++;
  }

  const result = new Map<string, string>();
  for (let i = 0; i < group.length; i++) {
    const segs = segArrays[i]!;
    const middle = segs.slice(commonPrefixLen, segs.length - commonSuffixLen);
    const prefix = middle.length === 0 ? '' : middle.join('-');
    result.set(group[i]!, prefix ? `${prefix}-${base}` : base);
  }

  const seen = new Set<string>();
  let unique = true;
  for (const v of result.values()) {
    if (seen.has(v)) {
      unique = false;
      break;
    }
    seen.add(v);
  }
  if (unique) return result;

  const fallback = new Map<string, string>();
  for (let i = 0; i < group.length; i++) {
    const segs = segArrays[i]!;
    const middle = segs.slice(0, segs.length - commonSuffixLen);
    fallback.set(group[i]!, `${middle.join('-')}-${base}`);
  }
  return fallback;
}
