// Each sub-CLI ends with `runIfDirect(main, import.meta.url)` so it runs
// main() when invoked directly and stays silent when imported as a library.

import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export function runIfDirect(
  main: () => Promise<number>,
  importMetaUrl: string
): void {
  if (!isDirectInvocation(importMetaUrl)) return;
  main().then((code) => process.exit(code));
}

function isDirectInvocation(importMetaUrl: string): boolean {
  try {
    if (!process.argv[1]) return false;
    // realpath both so bin symlinks resolve to the dist file and still match
    const entry = realpathSync(path.resolve(process.argv[1]));
    const self = realpathSync(fileURLToPath(importMetaUrl));
    return entry === self;
  } catch {
    return false;
  }
}
