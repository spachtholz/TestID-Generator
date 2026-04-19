# Development

Working on the toolchain itself? Here's the short version.

```bash
npm install
npm run build    # TypeScript → dist/
npm test         # vitest
npm pack         # bundles a .tgz
```

## How the code is laid out

Sources live under `src/`, tests under `test/`. The public library API sits in `src/index.ts`, and each CLI gets its own `src/**/cli.ts` — the `tag`, `diff`, and `gen-locators` commands are all siblings, not buried inside one monolithic entry point.

If you're fixing a bug in a specific command, start there. If you're touching shared logic (the ID generation, the registry writer, the parser), it's in the top-level modules under `src/`.

## Testing

Tests are written in vitest and run from `test/`. They cover the CLI end-to-end and the internal modules individually, so when you break something, the failing test usually points right at the problem.

## See also

- [`CHANGELOG.md`](../CHANGELOG.md) — what changed in each version
