/**
 * Shared helpers used by every CLI entry file.
 *
 * Each `src/**\/cli.ts` ends with the same realpath-based check so that
 * running the script directly (via its `bin` symlink, via `node dist/.../cli.js`,
 * or via a tsx wrapper) executes `main()`, while importing the module as a
 * library does not. Centralising the check removes 5× copy-paste and keeps
 * every CLI's startup tail to a single line.
 */

import { realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Run `main` iff this module is the process entry point.
 *
 * Both sides are passed through `realpathSync` so a `bin` symlink — as npm
 * installs globally — resolves to the underlying dist file and matches. Any
 * exception (missing argv, ENOENT during realpath) falls through as "not the
 * entry point", which is the safe default for library imports.
 */
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
    const entry = realpathSync(path.resolve(process.argv[1]));
    const self = realpathSync(fileURLToPath(importMetaUrl));
    return entry === self;
  } catch {
    return false;
  }
}
