#!/usr/bin/env node
/**
 * testid-rollback CLI.
 *
 * Undoes the most recent `testid tag` run by restoring the files archived in
 * the newest `backup.v{N}/` tree, deleting the corresponding `testids.v{N}.json`,
 * and rewinding `testids.latest.json` to the prior version. If no backup
 * exists, the command reports that and exits successfully (nothing to do).
 */

import { Command } from 'commander';
import pc from 'picocolors';
import * as path from 'node:path';
import { rollbackLatestRun } from './rollback.js';
import { VERSION } from '../version.js';
import { runIfDirect } from '../cli-common.js';

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = new Command();
  program
    .name('testid-rollback')
    .description('Undo the most recent testid tagger run using the pre-run backup.')
    .version(VERSION, '-V, --version', 'print the version and exit')
    .option('--registry-dir <dir>', 'registry directory (default: test-artifacts/testids)', 'test-artifacts/testids')
    .option('--cwd <dir>', 'base directory for relative paths (default: process.cwd())', process.cwd())
    .option('--dry-run', 'report what would be restored without changing anything', false)
    .option('--quiet', 'suppress normal stdout chatter', false)
    .allowExcessArguments(false)
    .addHelpText(
      'after',
      [
        '',
        'Example:',
        '  $ testid rollback',
        '  $ testid rollback --dry-run',
        '',
        'Rollback requires that the previous tagger run wrote a backup —',
        'i.e. writeBackups was not disabled via config or `tag --no-backup`.',
        ''
      ].join('\n')
    )
    .parse(argv.slice());

  const opts = program.opts<{
    registryDir: string;
    cwd: string;
    dryRun: boolean;
    quiet?: boolean;
  }>();

  const registryDir = path.resolve(opts.cwd, opts.registryDir);
  try {
    const result = await rollbackLatestRun({ registryDir, dryRun: opts.dryRun });

    if (result.rolledBackVersion === null) {
      if (!opts.quiet) {
        process.stdout.write(
          pc.yellow(`[testid-rollback] no backup found under ${registryDir} — nothing to undo.\n`)
        );
      }
      return 0;
    }

    if (!opts.quiet) {
      const verb = opts.dryRun ? 'would restore' : 'restored';
      process.stdout.write(
        pc.green(
          `[testid-rollback] ${verb} ${result.restoredFiles.length} file(s), ` +
            `rolled back v${result.rolledBackVersion}` +
            (result.restoredToVersion !== null
              ? ` → latest now points to v${result.restoredToVersion}.\n`
              : ' → no prior version, latest.json removed.\n')
        )
      );
      for (const file of result.restoredFiles) {
        process.stdout.write(pc.gray(`  ${file}\n`));
      }
      for (const file of result.failedFiles) {
        process.stderr.write(pc.red(`  [failed] ${file}\n`));
      }
    }
    return result.failedFiles.length > 0 ? 1 : 0;
  } catch (err) {
    process.stderr.write(pc.red(`[testid-rollback] ${(err as Error).message}\n`));
    return 2;
  }
}

runIfDirect(main, import.meta.url);
