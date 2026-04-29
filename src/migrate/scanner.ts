import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface ReferenceHit {
  file: string;
  line: number;
  column: number;
  variable: string;
}

const ROBOT_EXTENSIONS = new Set(['.robot', '.resource']);
const VAR_REFERENCE = /\$\{(\w+)\}/g;

export async function scanRobotProject(robotDir: string): Promise<ReferenceHit[]> {
  const files: string[] = [];
  await walk(robotDir, files);
  files.sort();

  const hits: ReferenceHit[] = [];
  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      VAR_REFERENCE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = VAR_REFERENCE.exec(line)) !== null) {
        hits.push({
          file,
          line: i + 1,
          column: m.index + 1,
          variable: m[1]!
        });
      }
    }
  }
  return hits;
}

export function filterHitsByRenames(
  hits: ReferenceHit[],
  renames: Map<string, string>
): ReferenceHit[] {
  return hits.filter((h) => renames.has(h.variable));
}

export function filterHitsByVariables(
  hits: ReferenceHit[],
  variables: Set<string>
): ReferenceHit[] {
  return hits.filter((h) => variables.has(h.variable));
}

async function walk(dir: string, out: string[]): Promise<void> {
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
      await walk(full, out);
    } else if (entry.isFile() && ROBOT_EXTENSIONS.has(path.extname(entry.name))) {
      out.push(full);
    }
  }
}
