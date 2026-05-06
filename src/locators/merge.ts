// Merge freshly-generated managed locator lines into an existing .py file
// without touching manual content. Managed = lines whose trailing comment
// starts with "# testid-managed" (optionally followed by " | YYYY-MM-DD" when
// includeGeneratedDate is on). The date trailer is rewritten on every merge,
// never carried over, so it always reflects the current registry state.

import { renderManagedLine } from './render.js';
import type { LocatorEntry, LocatorModule } from './types.js';

/**
 * Matches the managed trailer with or without a `| YYYY-MM-DD` date. The
 * marker is anchored to the end of the line; anything before it is the
 * variable assignment we keep verbatim aside from the testid extraction.
 */
const MANAGED_TRAILER_PATTERN =
  /\s{2}# testid-managed(?:\s*\|\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

export type ClassifiedLine =
  | { kind: 'managed'; raw: string; testid: string }
  | { kind: 'manual'; raw: string };

export type LocatorBlock =
  | { kind: 'managed'; lines: Array<Extract<ClassifiedLine, { kind: 'managed' }>> }
  | { kind: 'manual'; lines: string[] };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function classifyLocatorLine(
  line: string,
  attributeName: string
): ClassifiedLine {
  if (!MANAGED_TRAILER_PATTERN.test(line)) {
    return { kind: 'manual', raw: line };
  }
  // Match both notations:
  //   xpath form: `@data-testid='value'` (the `@` comes from XPath)
  //   css   form: `[data-testid='value']` (no `@`, attribute selector)
  const attr = escapeRegex(attributeName);
  const testidPattern = new RegExp(`(?:@${attr}|\\[${attr})='([^']+)'`);
  const match = testidPattern.exec(line);
  if (!match) {
    return { kind: 'manual', raw: line };
  }
  return { kind: 'managed', raw: line, testid: match[1]! };
}

export function splitIntoBlocks(source: string, attributeName: string): LocatorBlock[] {
  if (source.length === 0) return [];
  // drop trailing newline so split doesn't produce a phantom empty last line
  const normalised = source.endsWith('\n') ? source.slice(0, -1) : source;
  const lines = normalised.split(/\r?\n/);
  const blocks: LocatorBlock[] = [];
  for (const line of lines) {
    const classified = classifyLocatorLine(line, attributeName);
    const tail = blocks[blocks.length - 1];
    if (classified.kind === 'managed') {
      if (tail && tail.kind === 'managed') {
        tail.lines.push(classified);
      } else {
        blocks.push({ kind: 'managed', lines: [classified] });
      }
    } else {
      if (tail && tail.kind === 'manual') {
        tail.lines.push(classified.raw);
      } else {
        blocks.push({ kind: 'manual', lines: [classified.raw] });
      }
    }
  }
  return blocks;
}

export interface MergeInput {
  existingSource: string;
  freshModule: LocatorModule;
  attributeName: string;
}

export function mergeLocatorModule(input: MergeInput): string {
  const { existingSource, freshModule, attributeName } = input;
  const blocks = splitIntoBlocks(existingSource, attributeName);
  const freshByTestid = new Map<string, LocatorEntry>();
  for (const entry of freshModule.entries) {
    freshByTestid.set(entry.testid, entry);
  }

  const seenTestids = new Set<string>();
  for (const block of blocks) {
    if (block.kind !== 'managed') continue;
    const updated: Array<Extract<ClassifiedLine, { kind: 'managed' }>> = [];
    for (const line of block.lines) {
      const fresh = freshByTestid.get(line.testid);
      if (!fresh) continue; // testid gone from registry
      updated.push({
        kind: 'managed',
        raw: renderManagedLine(fresh),
        testid: line.testid
      });
      seenTestids.add(line.testid);
    }
    block.lines = updated;
  }

  // new testids go into the last managed block, or a fresh one if none exists
  const newEntries: LocatorEntry[] = [];
  for (const entry of freshModule.entries) {
    if (!seenTestids.has(entry.testid)) newEntries.push(entry);
  }

  if (newEntries.length > 0) {
    let target = findLastManagedBlock(blocks);
    if (!target) {
      target = { kind: 'managed', lines: [] };
      blocks.push(target);
    }
    for (const entry of newEntries) {
      target.lines.push({
        kind: 'managed',
        raw: renderManagedLine(entry),
        testid: entry.testid
      });
    }
  }

  for (const block of blocks) {
    if (block.kind !== 'managed') continue;
    block.lines.sort((a, b) => a.raw.localeCompare(b.raw));
  }

  const nonEmpty = blocks.filter((b) =>
    b.kind === 'managed' ? b.lines.length > 0 : true
  );

  return renderBlocks(nonEmpty);
}

function findLastManagedBlock(
  blocks: LocatorBlock[]
): Extract<LocatorBlock, { kind: 'managed' }> | null {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]!;
    if (b.kind === 'managed') return b;
  }
  return null;
}

function renderBlocks(blocks: LocatorBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.kind === 'managed') {
      for (const line of block.lines) parts.push(line.raw);
    } else {
      for (const line of block.lines) parts.push(line);
    }
  }
  return parts.join('\n') + '\n';
}
