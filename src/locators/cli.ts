#!/usr/bin/env node
/**
 * testid-gen-locators CLI.
 *
 * Converts a testid registry into per-component Python modules suitable for
 * import from a Robot Framework library. Each module looks like:
 *
 *     orderListThId = "xpath://*[@data-testid='order-list__th--id']"  # testid-managed
 *
 * Usage:
 *   testid-gen-locators <registry.json> --out-dir <dir> [options]
 */

import { Command } from 'commander';
import pc from 'picocolors';
import { loadRegistry } from '../registry/index.js';
import { generateLocators } from './generator.js';
import { VERSION } from '../version.js';
import { runIfDirect } from '../cli-common.js';
import { loadTestidConfig } from '../config/loader.js';

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  const program = new Command();
  program
    .name('testid-gen-locators')
    .description(
      'Generate Python Robot-Framework locator modules from a testid registry JSON'
    )
    .version(VERSION, '-V, --version', 'print the version and exit')
    .argument('<registry>', 'Path to the registry JSON (e.g. testids.latest.json)')
    .requiredOption('--out-dir <dir>', 'Output directory for per-component .py files')
    .option('--attribute-name <name>', 'Override data-testid attribute name')
    .option(
      '--xpath-prefix <prefix>',
      "XPath prefix (default 'xpath:'). Pass '' to omit."
    )
    .option(
      '--variable-format <template>',
      'Python variable-name template. Placeholders: {component}, {element}, {key}, {tag}, {hash}, {testid}. Default: {component}_{element}_{key}'
    )
    .option(
      '--mode <mode>',
      'Write strategy: merge (default, preserves manual lines), overwrite (rewrite from scratch), refuse (fail if file exists)'
    )
    .option(
      '--lock-names',
      'Persist each emitted variable name onto its registry entry (locator_name) and reuse it on later runs. Makes Python constants stable against semantic drift.'
    )
    .option(
      '--regenerate-names',
      'With --lock-names, force-refresh all persisted names from the current --variable-format. Use once after changing the template.'
    )
    .option('--config <path>', 'Path to testid.config.json')
    .option(
      '--no-overwrite',
      'Deprecated alias for --mode refuse.'
    )
    .option('--quiet', 'Suppress normal stdout chatter', false)
    .allowExcessArguments(false)
    .addHelpText(
      'after',
      [
        '',
        'Example:',
        '  $ testid-gen-locators test-artifacts/testids/testids.latest.json \\',
        '      --out-dir tests/locators --xpath-prefix xpath:',
        ''
      ].join('\n')
    )
    .parse(argv.slice());

  const [registryPath] = program.args;
  const opts = program.opts<{
    outDir: string;
    attributeName?: string;
    xpathPrefix?: string;
    variableFormat?: string;
    mode?: string;
    config?: string;
    overwrite: boolean;
    lockNames?: boolean;
    regenerateNames?: boolean;
    quiet?: boolean;
  }>();

  if (!registryPath) {
    process.stderr.write(pc.red('[testid-gen-locators] Missing <registry> argument.\n'));
    return 2;
  }

  const configResult = await loadTestidConfig(opts.config);
  const locatorsConfig = configResult.config.locators;
  const taggerConfig = configResult.config.tagger;

  // Resolve mode: explicit --mode > --no-overwrite (deprecated alias) >
  // config.mode > legacy config.overwrite > default 'merge'.
  let mode: 'merge' | 'overwrite' | 'refuse';
  if (opts.mode !== undefined) {
    if (opts.mode !== 'merge' && opts.mode !== 'overwrite' && opts.mode !== 'refuse') {
      process.stderr.write(
        pc.red(`[testid-gen-locators] Invalid --mode "${opts.mode}". Valid: merge, overwrite, refuse.\n`)
      );
      return 2;
    }
    mode = opts.mode;
  } else if (opts.overwrite === false) {
    // commander exposes --no-overwrite as { overwrite: false }
    process.stderr.write(
      pc.yellow('[testid-gen-locators] --no-overwrite is deprecated; use --mode refuse instead.\n')
    );
    mode = 'refuse';
  } else {
    mode = locatorsConfig.mode;
    if (locatorsConfig.overwrite !== undefined && opts.mode === undefined) {
      // Config has the legacy `overwrite` field; let the generator map it if
      // the newer `mode` wasn't also set in the config.
      // (schema.ts leaves `mode` at its default 'merge' when unset, so we
      // need an explicit check on overwrite to honour legacy configs.)
      if (locatorsConfig.overwrite === true && locatorsConfig.mode === 'merge') {
        mode = 'overwrite';
      } else if (locatorsConfig.overwrite === false && locatorsConfig.mode === 'merge') {
        mode = 'refuse';
      }
    }
  }

  let registry;
  try {
    registry = await loadRegistry(registryPath);
  } catch (err) {
    process.stderr.write(
      pc.red(`[testid-gen-locators] Failed to load registry: ${(err as Error).message}\n`)
    );
    return 2;
  }

  try {
    const lockNames = opts.lockNames ?? locatorsConfig.lockNames;
    const regenerateNames = opts.regenerateNames ?? locatorsConfig.regenerateNames;
    const result = await generateLocators(registry, {
      outDir: opts.outDir,
      registryPath,
      attributeName: opts.attributeName ?? locatorsConfig.attributeName ?? taggerConfig.attributeName,
      xpathPrefix: opts.xpathPrefix ?? locatorsConfig.xpathPrefix,
      mode,
      variableFormat: opts.variableFormat ?? locatorsConfig.variableFormat,
      lockNames,
      regenerateNames
    });
    if (!opts.quiet) {
      process.stdout.write(
        pc.green(
          `[testid-gen-locators] wrote ${result.writtenPaths.length} module(s) ` +
            `covering ${Object.keys(registry.entries).length} testid(s).\n`
        )
      );
      for (const p of result.writtenPaths) {
        process.stdout.write(pc.gray(`  ${p}\n`));
      }
      if (result.registryWritten) {
        process.stdout.write(
          pc.gray(`  (updated ${registryPath} with locked locator names)\n`)
        );
      }
    }
    return 0;
  } catch (err) {
    process.stderr.write(pc.red(`[testid-gen-locators] ${(err as Error).message}\n`));
    return 2;
  }
}

runIfDirect(main, import.meta.url);
