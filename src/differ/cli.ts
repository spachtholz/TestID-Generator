#!/usr/bin/env node
/**
 * diff-testids CLI.
 *
 * Usage:
 *   diff-testids <old.json> <new.json> --out-dir <dir>
 *
 * Exit codes (FR-3.5):
 *   0 → no changes or only additions
 *   1 → removed / renamed / modified entries (review needed)
 *   2 → registry load / validation error
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { loadRegistry } from '../registry/index.js';
import { diffRegistries, exitCodeForDiff } from './diff-algorithm.js';
import { renderDiffMarkdown, renderDiffJson } from './report-generator.js';
import { VERSION } from '../version.js';
import { runIfDirect } from '../cli-common.js';

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = new Command();
  program
    .name('testid-differ')
    .description('Compare two testid registry JSON files and emit a diff report')
    .version(VERSION, '-V, --version', 'print the testid-differ version and exit')
    .argument('<old>', 'Path to the older registry (e.g. testids.v42.json)')
    .argument('<new>', 'Path to the newer registry (e.g. testids.v43.json)')
    .option('--out-dir <dir>', 'Directory to write diff.v{old}-v{new}.md + .json into')
    .option('--threshold <n>', 'Rename similarity threshold (default 0.8)', '0.8')
    .option('--now <iso>', 'Override generated_at timestamp (for deterministic CI)')
    .option('--quiet', 'Suppress normal stdout chatter', false)
    .option('--json-only', 'Write only the JSON diff (skip Markdown) — needs --out-dir', false)
    .option(
      '--show-regenerated',
      'Split `added` into truly-new vs regenerated (ids that existed in earlier versions). Off by default so diffs stay quiet unless you ask.',
      false
    )
    .allowExcessArguments(false)
    .addHelpText(
      'after',
      [
        '',
        'Exit codes:',
        '  0  no changes or only `added` entries',
        '  1  `renamed` / `removed` / `modified` entries (review required)',
        '  2  invalid input or registry load error',
        '',
        'Example:',
        '  $ testid-differ testids.v42.json testids.v43.json --out-dir test-artifacts/testids',
        ''
      ].join('\n')
    )
    .parse(argv.slice());

  const [oldPath, newPath] = program.args;
  const opts = program.opts<{
    outDir?: string;
    threshold: string;
    now?: string;
    quiet?: boolean;
    jsonOnly?: boolean;
    showRegenerated?: boolean;
  }>();

  if (!oldPath || !newPath) {
    process.stderr.write(pc.red('[testid-differ] Need <old.json> and <new.json> arguments.\n'));
    return 2;
  }

  let oldReg;
  let newReg;
  try {
    [oldReg, newReg] = await Promise.all([loadRegistry(oldPath), loadRegistry(newPath)]);
  } catch (err) {
    process.stderr.write(pc.red(`[testid-differ] Failed to load registry: ${(err as Error).message}\n`));
    return 2;
  }

  const threshold = Number.parseFloat(opts.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
    process.stderr.write(pc.red(`[testid-differ] Invalid --threshold: ${opts.threshold}\n`));
    return 2;
  }

  const diff = diffRegistries(oldReg, newReg, {
    threshold,
    now: opts.now ?? new Date().toISOString(),
    showRegenerated: opts.showRegenerated ?? false
  });

  const md = renderDiffMarkdown(diff);
  const json = renderDiffJson(diff);

  if (opts.outDir) {
    await fs.mkdir(opts.outDir, { recursive: true });
    const stem = `diff.v${diff.from_version}-v${diff.to_version}`;
    const jsonPath = path.join(opts.outDir, `${stem}.json`);
    await fs.writeFile(jsonPath, json, 'utf8');
    if (!opts.quiet) {
      process.stdout.write(pc.gray(`[testid-differ] wrote ${jsonPath}\n`));
    }
    if (!opts.jsonOnly) {
      const mdPath = path.join(opts.outDir, `${stem}.md`);
      await fs.writeFile(mdPath, md, 'utf8');
      if (!opts.quiet) process.stdout.write(pc.gray(`[testid-differ] wrote ${mdPath}\n`));
    }
  } else if (!opts.quiet) {
    process.stdout.write(md);
  }

  if (!opts.quiet) {
    const { summary } = diff;
    const msg =
      `unchanged=${summary.unchanged} added=${summary.added} removed=${summary.removed} ` +
      `renamed=${summary.renamed} modified=${summary.modified} regenerated=${summary.regenerated}`;
    process.stdout.write(pc.cyan(`[testid-differ] v${diff.from_version} → v${diff.to_version}: ${msg}\n`));
  }

  return exitCodeForDiff(diff);
}

runIfDirect(main, import.meta.url);
