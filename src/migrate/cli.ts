#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { loadLocatorSnapshot } from './snapshot.js';
import { buildMigrationPlan, type RenameEntry } from './plan.js';
import { scanRobotProject, filterHitsByVariables } from './scanner.js';
import { applyRenames } from './applier.js';
import { renderMigrationReport } from './report.js';
import { VERSION } from '../version.js';
import { runIfDirect } from '../cli-common.js';

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = new Command();
  program
    .name('testid-migrate-locators')
    .description(
      'Compare two locator output directories, then rewrite ${var} references in a Robot Framework project.'
    )
    .version(VERSION, '-V, --version', 'print the version and exit')
    .requiredOption('--from <dir>', 'Path to the previous locator output directory (.py files)')
    .requiredOption('--to <dir>', 'Path to the current locator output directory (.py files)')
    .requiredOption('--robot-dir <dir>', 'Root of the Robot Framework project to update')
    .option('--apply', 'Write the changes (default: dry-run)', false)
    .option('--report-out <path>', 'Write the report to a file instead of stdout')
    .option('--quiet', 'Suppress normal stdout chatter', false)
    .allowExcessArguments(false)
    .addHelpText(
      'after',
      [
        '',
        'Example:',
        '  $ testid migrate-locators --from tests/locators-v1 --to tests/locators-v2 --robot-dir tests/',
        '  $ testid migrate-locators --from old/ --to new/ --robot-dir tests/ --apply',
        '',
        'Exit codes:',
        '  0  no changes or migration succeeded',
        '  1  conflicts detected (still proceeds in --apply mode, but flags them)',
        '  2  invalid input or filesystem error',
        ''
      ].join('\n')
    )
    .parse(argv.slice());

  const opts = program.opts<{
    from: string;
    to: string;
    robotDir: string;
    apply: boolean;
    reportOut?: string;
    quiet?: boolean;
  }>();

  let fromSnapshot;
  let toSnapshot;
  try {
    [fromSnapshot, toSnapshot] = await Promise.all([
      loadLocatorSnapshot(opts.from),
      loadLocatorSnapshot(opts.to)
    ]);
  } catch (err) {
    process.stderr.write(
      pc.red(`[testid-migrate-locators] Failed to read snapshots: ${(err as Error).message}\n`)
    );
    return 2;
  }

  if (fromSnapshot.sourceFiles.length === 0) {
    process.stderr.write(
      pc.red(`[testid-migrate-locators] No .py files found under ${opts.from}\n`)
    );
    return 2;
  }
  if (toSnapshot.sourceFiles.length === 0) {
    process.stderr.write(
      pc.red(`[testid-migrate-locators] No .py files found under ${opts.to}\n`)
    );
    return 2;
  }

  const plan = buildMigrationPlan(fromSnapshot, toSnapshot);
  const renamesMap = renamesAsMap(plan.renames);

  let hits: Awaited<ReturnType<typeof scanRobotProject>>;
  let orphanHits: Awaited<ReturnType<typeof scanRobotProject>>;
  try {
    const allHits = await scanRobotProject(opts.robotDir);
    hits = filterHitsByVariables(allHits, new Set(renamesMap.keys()));
    orphanHits = filterHitsByVariables(allHits, new Set(plan.orphans.map((o) => o.oldVariable)));
  } catch (err) {
    process.stderr.write(
      pc.red(`[testid-migrate-locators] Failed to scan robot dir: ${(err as Error).message}\n`)
    );
    return 2;
  }

  let applyResult;
  try {
    applyResult = await applyRenames({
      robotDir: opts.robotDir,
      renames: renamesMap,
      fileRenames: plan.fileRenames,
      dryRun: !opts.apply
    });
  } catch (err) {
    process.stderr.write(
      pc.red(`[testid-migrate-locators] Failed to apply renames: ${(err as Error).message}\n`)
    );
    return 2;
  }

  const report = renderMigrationReport({
    plan,
    hits,
    orphanHits,
    filesChanged: applyResult.filesChanged,
    occurrencesChanged: applyResult.occurrencesChanged,
    pathRewrites: applyResult.pathRewrites,
    dryRun: !opts.apply,
    robotDir: opts.robotDir
  });

  if (opts.reportOut) {
    try {
      await fs.mkdir(path.dirname(opts.reportOut), { recursive: true });
      await fs.writeFile(opts.reportOut, report, 'utf8');
      if (!opts.quiet) {
        process.stdout.write(pc.gray(`[testid-migrate-locators] report -> ${opts.reportOut}\n`));
      }
    } catch (err) {
      process.stderr.write(
        pc.red(`[testid-migrate-locators] Failed to write report: ${(err as Error).message}\n`)
      );
      return 2;
    }
  } else if (!opts.quiet) {
    process.stdout.write(report);
  }

  if (!opts.quiet) {
    const verb = opts.apply ? 'updated' : 'would update';
    process.stdout.write(
      pc.green(
        `[testid-migrate-locators] ${verb} ${applyResult.filesChanged} file(s), ` +
          `${applyResult.occurrencesChanged} occurrence(s).\n`
      )
    );
  }

  return plan.conflicts.length > 0 ? 1 : 0;
}

function renamesAsMap(renames: RenameEntry[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of renames) out.set(r.oldVariable, r.newVariable);
  return out;
}

runIfDirect(main, import.meta.url);
