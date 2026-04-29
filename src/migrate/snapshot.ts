import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface LocatorSnapshot {
  /** testid -> variable name */
  byTestid: Map<string, string>;
  /** variable name -> testid (for collision/conflict detection) */
  byVariable: Map<string, string>;
  /** absolute paths of the .py files we read */
  sourceFiles: string[];
}

const MANAGED_LINE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"[^"]*\[@[\w-]+='([^']+)'\][^"]*"\s*#\s*testid-managed\s*$/;

export async function loadLocatorSnapshot(dir: string): Promise<LocatorSnapshot> {
  const files = await collectPyFiles(dir);
  const byTestid = new Map<string, string>();
  const byVariable = new Map<string, string>();

  for (const file of files) {
    const text = await fs.readFile(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = MANAGED_LINE.exec(line);
      if (!m) continue;
      const variable = m[1]!;
      const testid = m[2]!;
      byTestid.set(testid, variable);
      byVariable.set(variable, testid);
    }
  }

  return { byTestid, byVariable, sourceFiles: files };
}

async function collectPyFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  await walk(dir, out);
  return out.sort();
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
      await walk(full, out);
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      out.push(full);
    }
  }
}
