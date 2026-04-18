import { describe, it, expect } from 'vitest';
import { SUBCOMMANDS, main as dispatcherMain } from '../src/cli.js';

describe('testid CLI dispatcher', () => {
  it('maps every alias back to a canonical subcommand', () => {
    const canonicals = new Set<string>();
    for (const [, entry] of Object.entries(SUBCOMMANDS)) {
      canonicals.add(entry.canonical);
    }
    // Every canonical name is itself a key (self-mapping), so the set of
    // canonicals is exactly the set of canonical keys.
    for (const canonical of canonicals) {
      expect(SUBCOMMANDS[canonical]?.canonical).toBe(canonical);
    }
  });

  it('registers every expected top-level command', () => {
    const canonicals = new Set(
      Object.values(SUBCOMMANDS).map((entry) => entry.canonical)
    );
    expect(canonicals).toEqual(
      new Set(['tag', 'diff', 'gen-locators'])
    );
  });

  it('exits 0 on --help without running any sub-CLI', async () => {
    const code = await dispatcherMain(['node', 'testid', '--help']);
    expect(code).toBe(0);
  });

  it('exits 0 on --version', async () => {
    const code = await dispatcherMain(['node', 'testid', '--version']);
    expect(code).toBe(0);
  });

  it('exits 2 with an error on an unknown subcommand', async () => {
    const code = await dispatcherMain(['node', 'testid', 'bogus-command']);
    expect(code).toBe(2);
  });
});
