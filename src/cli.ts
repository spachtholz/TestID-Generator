#!/usr/bin/env node
// Unified `testid` dispatcher. Sub-CLIs are imported lazily so --help/--version
// don't load @angular/compiler + ajv + zod.
// TODO: ontology subcommand once the owl exporter is reintroduced

import pc from 'picocolors';
import { VERSION } from './version.js';
import { runIfDirect } from './cli-common.js';

type SubMain = (argv: readonly string[]) => Promise<number>;

interface Subcommand {
  canonical: string;
  description: string;
  load: () => Promise<SubMain>;
}

export const SUBCOMMANDS: Record<string, Subcommand> = {
  tag: {
    canonical: 'tag',
    description: 'Inject data-testid attributes into Angular templates',
    load: async () => (await import('./tagger/cli.js')).main
  },
  tagger: {
    canonical: 'tag',
    description: 'Alias for `tag`',
    load: async () => (await import('./tagger/cli.js')).main
  },
  diff: {
    canonical: 'diff',
    description: 'Compare two registry JSON files and emit a diff report',
    load: async () => (await import('./differ/cli.js')).main
  },
  differ: {
    canonical: 'diff',
    description: 'Alias for `diff`',
    load: async () => (await import('./differ/cli.js')).main
  },
  'gen-locators': {
    canonical: 'gen-locators',
    description: 'Generate Robot Framework Python locator modules',
    load: async () => (await import('./locators/cli.js')).main
  },
  locators: {
    canonical: 'gen-locators',
    description: 'Alias for `gen-locators`',
    load: async () => (await import('./locators/cli.js')).main
  },
  robot: {
    canonical: 'gen-locators',
    description: 'Alias for `gen-locators`',
    load: async () => (await import('./locators/cli.js')).main
  },
  rollback: {
    canonical: 'rollback',
    description: 'Undo the most recent tag run using the pre-run backup',
    load: async () => (await import('./rollback/cli.js')).main
  },
  undo: {
    canonical: 'rollback',
    description: 'Alias for `rollback`',
    load: async () => (await import('./rollback/cli.js')).main
  },
  'migrate-locators': {
    canonical: 'migrate-locators',
    description: 'Sync Robot Framework ${var} references after locator renames',
    load: async () => (await import('./migrate/cli.js')).main
  }
};

export async function main(argv: readonly string[] = process.argv): Promise<number> {
  // argv layout: ['node', 'testid', <sub?>, ...rest]
  const [, , sub, ...rest] = argv;

  if (!sub || sub === '-h' || sub === '--help' || sub === 'help') {
    printGlobalHelp();
    return 0;
  }
  if (sub === '-V' || sub === '--version') {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const entry = SUBCOMMANDS[sub];
  if (!entry) {
    process.stderr.write(pc.red(`[testid] Unknown subcommand: ${sub}\n\n`));
    printGlobalHelp(process.stderr);
    return 2;
  }

  const subMain = await entry.load();
  return subMain(['node', `testid ${entry.canonical}`, ...rest]);
}

function printGlobalHelp(stream: NodeJS.WriteStream = process.stdout): void {
  const lines: string[] = [];
  lines.push(`${pc.bold('testid')} v${VERSION} - automate Angular data-testid generation`);
  lines.push('');
  lines.push(pc.bold('Usage:'));
  lines.push('  testid <command> [options]');
  lines.push('  testid --help');
  lines.push('  testid <command> --help');
  lines.push('');
  lines.push(pc.bold('Commands:'));
  for (const [name, entry] of canonicalRows()) {
    lines.push(`  ${pc.cyan(name.padEnd(14))}  ${entry.description}`);
  }
  lines.push('');
  lines.push(pc.bold('Aliases:'));
  for (const [name, entry] of aliasRows()) {
    lines.push(`  ${pc.gray(name.padEnd(14))}  → ${entry.canonical}`);
  }
  lines.push('');
  lines.push(pc.bold('Examples:'));
  lines.push('  testid tag --configuration test --verbose');
  lines.push('  testid diff testids.v1.json testids.v2.json --out-dir diffs/');
  lines.push('  testid gen-locators testids.latest.json --out-dir tests/locators');
  lines.push('  testid migrate-locators --from old/ --to new/ --robot-dir tests/');
  lines.push('  testid rollback                              # undo the last tag run');
  lines.push('');
  lines.push(
    pc.gray(
      'Each command accepts `--help` for its own option reference, e.g. `testid tag --help`.'
    )
  );
  lines.push('');
  stream.write(lines.join('\n'));
}

function canonicalRows(): [string, Subcommand][] {
  return Object.entries(SUBCOMMANDS).filter(([name, entry]) => name === entry.canonical);
}

function aliasRows(): [string, Subcommand][] {
  return Object.entries(SUBCOMMANDS).filter(([name, entry]) => name !== entry.canonical);
}

runIfDirect(main, import.meta.url);
