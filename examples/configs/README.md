# Example Configurations

Copy one of these files into your project root as `testid.config.json`. Each example is a standalone, valid config - no merging with defaults required.

| File | Purpose |
|---|---|
| [`minimal.json`](./minimal.json) | Smallest possible registry JSON. Stable IDs, no extra metadata. |
| [`full-featured.json`](./full-featured.json) | All features enabled: full semantic trace, activity log, backups, 10-version retention, regenerated-entry splitting, monorepo-safe component naming, locked locator names. |
| [`monorepo.json`](./monorepo.json) | Tailored for `apps/*` + `libs/*` layouts where several templates share basenames. `componentNaming: 'disambiguate'` keeps testids globally unique; `lockNames: true` freezes Robot variables. |
| [`primeng-exclude.json`](./primeng-exclude.json) | Skips decorative PrimeNG wrappers (`p-panel`, `p-card`, `p-toolbar`, …). |
| [`custom-tag-map.json`](./custom-tag-map.json) | Maps custom Angular components (`<app-user-menu>`, `<app-chart>`, …) to short element-type names. |
| [`cypress-style.json`](./cypress-style.json) | Uses `data-cy` with a prefix-based idFormat (`cy-component-element-key`) and a curated semantic-field whitelist. |
| [`hash-only-with-readable-locators.json`](./hash-only-with-readable-locators.json) | Opaque hash-only testids in the HTML combined with readable Python variable names via `variableFormat`. |
| [`with-manual-locators.json`](./with-manual-locators.json) | Uses `locators.mode: "merge"` (default) explicitly, so custom locator helpers can live alongside generated ones. |
| [`legacy-tagger-only.json`](./legacy-tagger-only.json) | Pre-0.4.0 config shape, for reference. Place as `testid-tagger.config.json`; the loader wraps it automatically. |

See [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration) for the full option reference.

## Available semantic fields

The fingerprint can extract these per-element fields. Pick a subset via `tagger.registry.semanticFields` to keep the registry compact, or omit the option to persist all of them.

| Field | Source |
|---|---|
| `formcontrolname` / `name` / `aria_label` / `placeholder` / `routerlink` / `text_content` / `type` / `role` | Core element attributes / static text. |
| `title` / `alt` / `value` / `html_id` / `href` / `src` / `html_for` / `label` | Universal HTML attributes captured as scalars. |
| `static_attributes` | Catch-all for any other static attribute (`severity`, `variant`, `icon`, ...). |
| `bound_identifiers` | Identifier paths read by bound inputs, e.g. `[data]="currentOrder"`. |
| `event_handlers` | Function names invoked by event handlers, e.g. `(click)="saveOrder()"`. |
| `i18n_keys` | String literals fed into translation pipes (`translate`, `transloco`, `t`, `i18n`). |
| `bound_text_paths` | Property paths from `{{ … }}` interpolations, e.g. `order.id`. |
| `css_classes` | Sorted, deduplicated class tokens — often the only differentiator on bare wrappers. |
| `child_shape` | Tag sequence of immediate element children, in source order — kills wrapper-collisions when two `<div>`s wrap different content. |
| `context` | Surrounding-context anchors: `<label for>`, wrapper `<mat-label>` / `<legend>`, preceding `<h*>`, parent `formControlName`, `aria-labelledby`. |
| `structural_directives` | `*ngIf` / `*ngFor` / `*ngSwitchCase` lifted from the synthetic `<ng-template>` wrapper Angular generates. |

## Useful top-level options

- `tagger.componentNaming` / `locators.componentNaming` — `'basename'` (legacy default), `'basename-strict'` (fail loudly), `'disambiguate'` (path-prefix on collision). Recommended for monorepos.
- `tagger.collisionStrategy` — `'auto'` (default; tries readable `--1`/`--2` sibling-index first, falls back to `{hash}`), `'sibling-index'` (always `--N`), `'hash-suffix'` (always `{hash}`), `'error'` (throw).
- `tagger.idFormat` placeholders — `{component}`, `{element}`, `{key}`, `{tag}`, `{hash}`, `{hash:-}`, `{disambiguator}`, `{disambiguator:--}` (the `:--` variants render as `--<value>` when set, empty otherwise).
- `tagger.includeUtilityClasses` — when `true`, Tailwind / utility-shaped classes are eligible to drive the readable `{key}` segment. Off by default.
- `tagger.registry.semanticFields` — pick exactly which fields to persist.
- `tagger.registryInputDir` / `tagger.registryOutputDir` — read previous registry from one path, write fresh snapshots to another (CI / hermetic-build setups).
- `locators.lockNames` — freeze Python variable names once written, so existing tests survive semantic drift.

## Quick copy

```bash
cp examples/configs/full-featured.json        testid.config.json
cp examples/configs/monorepo.json             testid.config.json
cp examples/configs/minimal.json              testid.config.json
cp examples/configs/primeng-exclude.json      testid.config.json
cp examples/configs/custom-tag-map.json       testid.config.json
cp examples/configs/cypress-style.json        testid.config.json
cp examples/configs/hash-only-with-readable-locators.json  testid.config.json
```

The `_comment` field in each file is ignored by the loader - unknown top-level keys are dropped during schema parsing.
