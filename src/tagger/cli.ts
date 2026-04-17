#!/usr/bin/env node
/**
 * testid-tagger CLI.
 *
 * Injects deterministic data-testid attributes into Angular templates. Runs
 * standalone against any Angular project — no build-pipeline integration
 * required.
 *
 * Run `testid-tagger --help` for the flag reference.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig, findDefaultConfig, DEFAULT_CONFIG, type TaggerConfig } from './config-loader.js';
import { runTagger } from './tagger.js';
import { VERSION } from '../version.js';
import { runIfDirect } from '../cli-common.js';

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = new Command();
  program
    .name('testid-tagger')
    .description(
      'Inject deterministic data-testid attributes into Angular templates. ' +
        'Supports Angular 18+ control-flow (@if/@for/@switch). Writes a ' +
        'versioned registry JSON alongside the tagged templates.'
    )
    .version(VERSION, '-V, --version', 'print the testid-tagger version and exit')
    .option('--config <path>', 'config file (.json, .mjs, .js, .ts). Auto-discovered when omitted')
    .option('--configuration <name>', 'Angular build configuration ("test" enables tagging)')
    .option('--dry-run', 'parse + plan + report but write nothing', false)
    .option('--output-dir <dir>', 'write tagged templates into this directory instead of in-place')
    .option('--registry-dir <dir>', 'override config.registryDir')
    .option('--cwd <dir>', 'base directory for relative paths (default: process.cwd())', process.cwd())
    .option('--now <iso>', 'override generated_at timestamp (for reproducible CI)')
    .option('--attribute-name <name>', 'override config.attributeName (e.g. data-cy)')
    .option('--hash-length <n>', 'override config.hashLength (4..16)', (v) => Number.parseInt(v, 10))
    .option('--verbose', 'print per-file and per-element detail on stderr', false)
    .option(
      '--files <patterns...>',
      'restrict this run to specific templates (glob or path, relative to --cwd or absolute). Overrides config.include for this run.'
    )
    .option('--no-backup', 'skip writing pre-run backups (disables later `testid rollback`)')
    .allowExcessArguments(false)
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  $ testid-tagger --configuration test',
        '  $ testid-tagger --config ./testid-tagger.config.json --cwd ./apps/web',
        '  $ testid-tagger --dry-run --verbose          # audit without touching files',
        '  $ testid-tagger --attribute-name data-cy     # emit Cypress-style attrs',
        ''
      ].join('\n')
    )
    .parse(argv.slice());

  const opts = program.opts<{
    config?: string;
    configuration?: string;
    dryRun?: boolean;
    outputDir?: string;
    registryDir?: string;
    cwd: string;
    now?: string;
    attributeName?: string;
    hashLength?: number;
    verbose?: boolean;
    files?: string[];
    backup: boolean;
  }>();

  const verbose = !!opts.verbose;

  // Discover the config file if the user didn't pass one.
  let configPath = opts.config;
  if (!configPath) {
    configPath = (await findDefaultConfig(opts.cwd)) ?? undefined;
    if (verbose && configPath) {
      process.stderr.write(pc.gray(`[testid-tagger] auto-discovered config: ${configPath}\n`));
    } else if (verbose) {
      process.stderr.write(pc.gray(`[testid-tagger] no config found, using built-in defaults\n`));
    }
  }

  let loaded: { config: TaggerConfig; configPath: string | null; sourceDir: string };
  try {
    loaded = await loadConfig(configPath);
  } catch (err) {
    process.stderr.write(
      pc.yellow(
        `[testid-tagger] Could not load config (${(err as Error).message}). Using defaults.\n`
      )
    );
    loaded = { config: DEFAULT_CONFIG, configPath: null, sourceDir: opts.cwd };
  }

  // Apply CLI overrides on top of the resolved config.
  const config: TaggerConfig = { ...loaded.config };
  if (opts.attributeName) config.attributeName = opts.attributeName;
  if (typeof opts.hashLength === 'number' && Number.isFinite(opts.hashLength)) {
    config.hashLength = opts.hashLength;
  }
  // The CLI's --no-backup turns writeBackups off regardless of config; the
  // user's explicit opt-out always wins over a config default.
  if (opts.backup === false) {
    config.writeBackups = false;
  }

  process.stdout.write(
    pc.gray(
      `[testid-tagger] configuration=${opts.configuration ?? '(none)'} ` +
        `attribute=${config.attributeName} ` +
        `dry-run=${!!opts.dryRun} ` +
        `registry-dir=${opts.registryDir ?? config.registryDir}\n`
    )
  );

  try {
    const result = await runTagger(config, {
      cwd: opts.cwd,
      registryDir: opts.registryDir,
      outputDir: opts.outputDir,
      dryRun: opts.dryRun,
      configuration: opts.configuration,
      now: opts.now ?? new Date().toISOString(),
      verbose,
      files: opts.files
    });

    if (result.version === 0 && config.testConfigurationOnly && opts.configuration !== 'test') {
      process.stdout.write(
        pc.yellow(
          '[testid-tagger] Skipped — tagger is gated behind --configuration=test ' +
            '(disable with testConfigurationOnly=false in config).\n'
        )
      );
      return 0;
    }

    process.stdout.write(
      pc.green(
        `[testid-tagger] v${result.version}: tagged ${result.filesTagged} file(s), ` +
          `${result.entriesGenerated} entrie(s), ${result.collisions} collision(s).\n`
      )
    );
    if (result.registryPath) {
      process.stdout.write(pc.gray(`[testid-tagger] registry → ${result.registryPath}\n`));
    }
    return 0;
  } catch (err) {
    process.stderr.write(pc.red(`[testid-tagger] Failed: ${(err as Error).message}\n`));
    return 2;
  }
}

runIfDirect(main, import.meta.url);
