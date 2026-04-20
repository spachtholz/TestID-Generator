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
      'Python variable-name template. Placeholders: {component}, {element}, {key}, {tag}, {hash}. Default: {component}_{element}_{key}'
    )
    .option('--config <path>', 'Path to testid.config.json')
    .option(
      '--no-overwrite',
      'Refuse to overwrite pre-existing target files. Default: overwrite.'
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
    config?: string;
    overwrite: boolean;
    quiet?: boolean;
  }>();

  if (!registryPath) {
    process.stderr.write(pc.red('[testid-gen-locators] Missing <registry> argument.\n'));
    return 2;
  }

  const configResult = await loadTestidConfig(opts.config);
  const locatorsConfig = configResult.config.locators;
  const taggerConfig = configResult.config.tagger;

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
    const result = await generateLocators(registry, {
      outDir: opts.outDir,
      attributeName: opts.attributeName ?? locatorsConfig.attributeName ?? taggerConfig.attributeName,
      xpathPrefix: opts.xpathPrefix ?? locatorsConfig.xpathPrefix,
      overwrite: opts.overwrite,
      variableFormat: opts.variableFormat ?? locatorsConfig.variableFormat
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
    }
    return 0;
  } catch (err) {
    process.stderr.write(pc.red(`[testid-gen-locators] ${(err as Error).message}\n`));
    return 2;
  }
}

runIfDirect(main, import.meta.url);
