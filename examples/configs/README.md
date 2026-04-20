# Example Configurations

Drop the file you want into your project root, renamed to `testid.config.json`. Every example is a complete, valid config on its own — no merging needed.

| File | What it's for |
|---|---|
| [`minimal.json`](./minimal.json) | Smallest possible registry JSON. Pick this if you just want stable IDs and don't care about the extra metadata. |
| [`full-featured.json`](./full-featured.json) | Everything turned on: full semantic trace, activity log, backups, 10-version retention, regenerated-entry splitting. Solid default. |
| [`primeng-exclude.json`](./primeng-exclude.json) | Skips decorative PrimeNG wrappers (`p-panel`, `p-card`, `p-toolbar`, …) so the registry stays focused on interactive elements. |
| [`custom-tag-map.json`](./custom-tag-map.json) | Maps your own Angular components (`<app-user-menu>`, `<app-chart>`, …) to short readable names in the generated testids. |
| [`cypress-style.json`](./cypress-style.json) | Uses `data-cy` instead of `data-testid`, with a short prefix-based idFormat (`cy-component-element-key`) made for Cypress specs. |
| [`hash-only-with-readable-locators.json`](./hash-only-with-readable-locators.json) | Opaque hash-only testids in the HTML, but human-readable Python variable names in the Robot-Framework locator files via `variableFormat`. |
| [`legacy-tagger-only.json`](./legacy-tagger-only.json) | Pre-0.4.0 shape for reference. Place as `testid-tagger.config.json` — the loader wraps it automatically. |

For the full reference of every option, see [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration) in the wiki.

## Quick copy

```bash
# Pick one:
cp examples/configs/full-featured.json        testid.config.json
cp examples/configs/minimal.json              testid.config.json
cp examples/configs/primeng-exclude.json      testid.config.json
cp examples/configs/custom-tag-map.json       testid.config.json
cp examples/configs/cypress-style.json        testid.config.json
cp examples/configs/hash-only-with-readable-locators.json  testid.config.json
```

The `_comment` field in each file is ignored by the loader (unknown top-level keys are silently dropped when they're not in the schema). Feel free to drop it once you've read it.
