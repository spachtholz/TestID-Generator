import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { scanRobotProject, type ReferenceHit } from './scanner.js';
import type { FileRename } from './plan.js';

export interface ApplyResult {
  hits: ReferenceHit[];
  filesChanged: number;
  occurrencesChanged: number;
  skipped: number;
  /** Number of `Variables`/`Resource`/`Library` import paths that were
   *  rewritten because the underlying locator file got renamed. */
  pathRewrites: number;
}

export async function applyRenames(args: {
  robotDir: string;
  renames: Map<string, string>;
  fileRenames?: readonly FileRename[];
  dryRun: boolean;
}): Promise<ApplyResult> {
  const { robotDir, renames, dryRun } = args;
  const fileRenames = args.fileRenames ?? [];
  const allHits = await scanRobotProject(robotDir);
  const hits = allHits.filter((h) => renames.has(h.variable));

  if (renames.size === 0 && fileRenames.length === 0) {
    return { hits, filesChanged: 0, occurrencesChanged: 0, skipped: 0, pathRewrites: 0 };
  }

  // Build the set of files we may need to touch - the union of files that
  // reference renamed variables AND files we discover via a full re-scan
  // (path rewrites need to look at every file regardless of whether it
  // referenced a renamed variable).
  const filesToInspect = new Set<string>();
  for (const h of hits) filesToInspect.add(h.file);
  if (fileRenames.length > 0) {
    const allFiles = await scanAllRobotFiles(robotDir);
    for (const f of allFiles) filesToInspect.add(f);
  }

  let filesChanged = 0;
  let occurrencesChanged = 0;
  let pathRewrites = 0;

  for (const file of filesToInspect) {
    const original = await fs.readFile(file, 'utf8');

    // 1. Variable references `${oldName}` to `${newName}`
    let count = 0;
    let updated = original.replace(/\$\{(\w+)\}/g, (full, name) => {
      const next = renames.get(name);
      if (next === undefined) return full;
      count++;
      return `\${${next}}`;
    });

    // 2. Settings-block import paths. Robot accepts these forms:
    //      Variables   ../locators/order.py
    //      Resource    ../locators/order.py
    //      Library     ../locators/order.py
    //    The path can be relative; we only rewrite the basename portion so
    //    repos with different directory layouts keep their shape.
    let pathHits = 0;
    if (fileRenames.length > 0) {
      const stmtRegex =
        /^(\s*)(Variables|Resource|Library)(\s+)([^\s][^\n]*?)(\s*(?:#.*)?)$/gm;
      updated = updated.replace(stmtRegex, (full, indent, kind, sep, target, trailing) => {
        // Resolve target to a basename for matching. Trim trailing args
        // (Library can take args after the path).
        const trimmed = target.trim();
        // Path may have args: `Library  foo.py    arg1   arg2`. Split on
        // multi-space (Robot's column delimiter).
        const splitOnArgs = trimmed.split(/\s{2,}/);
        const candidatePath = splitOnArgs[0]!;
        if (!candidatePath.endsWith('.py')) return full;
        const base = path.basename(candidatePath);
        const rename = fileRenames.find((r) => r.oldFile === base);
        if (!rename) return full;
        const rewrittenPath = candidatePath.slice(0, -base.length) + rename.newFile;
        const rewrittenTarget =
          [rewrittenPath, ...splitOnArgs.slice(1)].join('    ');
        pathHits++;
        return `${indent}${kind}${sep}${rewrittenTarget}${trailing}`;
      });
    }

    if (updated === original) continue;
    if (count > 0) occurrencesChanged += count;
    pathRewrites += pathHits;
    filesChanged++;
    if (!dryRun) {
      await fs.writeFile(file, updated, 'utf8');
    }
  }

  return { hits, filesChanged, occurrencesChanged, skipped: 0, pathRewrites };
}

async function scanAllRobotFiles(robotDir: string): Promise<string[]> {
  const out: string[] = [];
  await walkRobot(robotDir, out);
  return out.sort();
}

async function walkRobot(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      await walkRobot(full, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (ext === '.robot' || ext === '.resource') out.push(full);
    }
  }
}
