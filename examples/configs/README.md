# Example Configurations

Copy one of these files into your project root as `testid.config.json`. Each example is a standalone, valid config - no merging with defaults required.

| File | Purpose |
|---|---|
| [`minimal.json`](./minimal.json) | Smallest possible registry JSON. Stable IDs, no extra metadata. |
| [`full-featured.json`](./full-featured.json) | All features enabled: full semantic trace, activity log, backups, 10-version retention, regenerated-entry splitting. |
| [`primeng-exclude.json`](./primeng-exclude.json) | Skips decorative PrimeNG wrappers (`p-panel`, `p-card`, `p-toolbar`, …). |
| [`custom-tag-map.json`](./custom-tag-map.json) | Maps custom Angular components (`<app-user-menu>`, `<app-chart>`, …) to short element-type names. |
| [`cypress-style.json`](./cypress-style.json) | Uses `data-cy` with a prefix-based idFormat (`cy-component-element-key`). |
| [`hash-only-with-readable-locators.json`](./hash-only-with-readable-locators.json) | Opaque hash-only testids in the HTML combined with readable Python variable names via `variableFormat`. |
| [`with-manual-locators.json`](./with-manual-locators.json) | Uses `locators.mode: "merge"` (default) explicitly, so custom locator helpers can live alongside generated ones. |
| [`legacy-tagger-only.json`](./legacy-tagger-only.json) | Pre-0.4.0 config shape, for reference. Place as `testid-tagger.config.json`; the loader wraps it automatically. |

See [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration) for the full option reference.

## Quick copy

```bash
cp examples/configs/full-featured.json        testid.config.json
cp examples/configs/minimal.json              testid.config.json
cp examples/configs/primeng-exclude.json      testid.config.json
cp examples/configs/custom-tag-map.json       testid.config.json
cp examples/configs/cypress-style.json        testid.config.json
cp examples/configs/hash-only-with-readable-locators.json  testid.config.json
```

The `_comment` field in each file is ignored by the loader - unknown top-level keys are dropped during schema parsing.
