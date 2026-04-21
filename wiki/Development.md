# Development

## Build and test

```bash
npm install
npm run build    # TypeScript → dist/
npm test         # vitest
npm pack         # bundles a .tgz
```

## Security and SBOM

Two additional scripts (built-in npm tooling, no extra dependencies):

```bash
npm run audit    # npm audit with --audit-level=high
npm run sbom     # writes sbom.cdx.json (CycloneDX) + sbom.spdx.json (SPDX)
```

SBOM files are generated into the repo root and are `.gitignore`d. In CI, `.github/workflows/security.yml` runs both commands on every push, every PR, and weekly on a cron schedule. SBOM artefacts are retained for 90 days. PRs additionally trigger `dependency-review-action`, which fails on newly-introduced high-severity advisories.

## Code layout

Sources under `src/`, tests under `test/`. The public library API is `src/index.ts`. Each CLI is a sibling module under `src/**/cli.ts`:

- `src/tagger/cli.ts` - `tag`
- `src/differ/cli.ts` - `diff`
- `src/locators/cli.ts` - `gen-locators`
- `src/rollback/cli.ts` - `rollback`
- `src/cli.ts` - unified dispatcher (`testid`)

Shared modules (id generation, registry, parser, config loader) live at the top level of `src/`.

## Testing

Tests are written in vitest under `test/`. They exercise each CLI end-to-end as well as the internal modules in isolation.

## See also

- [`CHANGELOG.md`](../CHANGELOG.md) - release notes
