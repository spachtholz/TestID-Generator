import { promises as fs } from 'node:fs';
import { scanRobotProject, type ReferenceHit } from './scanner.js';

export interface ApplyResult {
  hits: ReferenceHit[];
  filesChanged: number;
  occurrencesChanged: number;
  skipped: number;
}

export async function applyRenames(args: {
  robotDir: string;
  renames: Map<string, string>;
  dryRun: boolean;
}): Promise<ApplyResult> {
  const { robotDir, renames, dryRun } = args;
  const allHits = await scanRobotProject(robotDir);
  const hits = allHits.filter((h) => renames.has(h.variable));

  if (renames.size === 0) {
    return { hits, filesChanged: 0, occurrencesChanged: 0, skipped: 0 };
  }

  const byFile = groupByFile(hits);
  let filesChanged = 0;
  let occurrencesChanged = 0;

  for (const [file] of byFile) {
    const original = await fs.readFile(file, 'utf8');
    let count = 0;
    const updated = original.replace(/\$\{(\w+)\}/g, (full, name) => {
      const next = renames.get(name);
      if (next === undefined) return full;
      count++;
      return `\${${next}}`;
    });
    if (count === 0 || updated === original) continue;
    occurrencesChanged += count;
    filesChanged++;
    if (!dryRun) {
      await fs.writeFile(file, updated, 'utf8');
    }
  }

  return { hits, filesChanged, occurrencesChanged, skipped: 0 };
}

function groupByFile(hits: ReferenceHit[]): Map<string, ReferenceHit[]> {
  const map = new Map<string, ReferenceHit[]>();
  for (const h of hits) {
    const list = map.get(h.file) ?? [];
    list.push(h);
    map.set(h.file, list);
  }
  return map;
}
