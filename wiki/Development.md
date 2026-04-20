# Development

Working on the toolchain itself? Here's the short version.

```bash
npm install
npm run build    # TypeScript → dist/
npm test         # vitest
npm pack         # bundles a .tgz
```

## Security & SBOM

Two more scripts wired up in `package.json`, both using only built-in npm tooling — no extra deps:

```bash
npm run audit    # npm audit with --audit-level=high (non-zero exit on high/critical)
npm run sbom     # writes sbom.cdx.json (CycloneDX) + sbom.spdx.json (SPDX)
```

SBOM files land in the repo root and are `.gitignore`d. For CI, the same two commands run in `.github/workflows/security.yml` on every push, every PR and weekly on cron — SBOM artefacts are kept for 90 days. The workflow also runs `dependency-review-action` on PRs to block newly-introduced high-severity CVEs.

## How the code is laid out

Sources live under `src/`, tests under `test/`. The public library API sits in `src/index.ts`, and each CLI gets its own `src/**/cli.ts` — the `tag`, `diff`, and `gen-locators` commands are all siblings, not buried inside one monolithic entry point.

If you're fixing a bug in a specific command, start there. If you're touching shared logic (the ID generation, the registry writer, the parser), it's in the top-level modules under `src/`.

## Testing

Tests are written in vitest and run from `test/`. They cover the CLI end-to-end and the internal modules individually, so when you break something, the failing test usually points right at the problem.

## See also

- [`CHANGELOG.md`](../CHANGELOG.md) — what changed in each version
