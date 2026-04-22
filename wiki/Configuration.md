# Configuration

Since v0.4.0, all three sub-tools (tagger, differ, locator generator) read from a single unified config file in the project root.

| File | Notes |
|---|---|
| `testid.config.json` | Recommended. No tooling required. |
| `testid.config.mjs` / `.js` | For computed values or imported constants. |
| `testid.config.ts` | Requires a TypeScript runtime loader (e.g. ts-node). |

The legacy `testid-tagger.config.*` is still picked up as a fallback: when present and the new file is absent, its root fields are interpreted as the `tagger` section and a one-time deprecation warning is printed to stderr.

## Shape

```json
{
  "tagger":   { ... },
  "differ":   { ... },
  "locators": { ... }
}
```

All three sections are optional. An empty config resolves to all defaults; only the keys you override need to be present.

---

## `tagger` section

### Core options

| Option | Default | What it does |
|---|---|---|
| `rootDir` | `"src"` | Where to start looking, relative to the project root. |
| `include` | `["**/*.component.html"]` | Which templates to scan. |
| `ignore` | `[]` | Glob patterns to skip. |
| `registryDir` | `"test-artifacts/testids"` | Where the versioned registry files land. |
| `attributeName` | `"data-testid"` | The attribute itself - swap in `data-cy` for Cypress. |
| `hashAlgorithm` | `"sha256"` | `sha256`, `sha1`, or `md5`. |
| `hashLength` | `6` | Hash-suffix length, 4–16. |
| `collisionStrategy` | `"hash-suffix"` | `hash-suffix` or `error`. |
| `idFormat` | `"{component}__{element}--{key}{hash:-}"` | Naming template (see placeholders below). |
| `alwaysHash` | `false` | Force `{hash}` / `{hash:-}` to always render, not just on collisions. Use with hash-only `idFormat`s like `"tid-{hash}"`. |
| `testConfigurationOnly` | `true` | Only run in `--configuration=test`. |
| `registryRetention` | `0` | Keep only the N most recent `testids.vN.json` (0 = keep all). |
| `writeActivityLog` | `false` | Emit `activity.v{N}.md` + `.json` per run. |
| `writeBackups` | `true` | Mirror every overwritten template into `backup.v{N}/`. |
| `ignoreTags` | `[]` | Extra tag names to deny-list. |
| `customTagMap` | `{}` | Map custom tags to explicit `shortType` / `longType`. |

### ID-format placeholders

| Placeholder | Example |
|---|---|
| `{component}` | `order-form` |
| `{element}` | `input`, `dropdown`, `button` |
| `{key}` | The primary semantic value (`formcontrolname`, `aria-label`, …) or the tag name |
| `{tag}` | `p-dropdown`, `input` |
| `{hash}` | 6-char hex (empty when no collision) |
| `{hash:-}` | Same as `{hash}` but prefixed with `-` when non-empty |

### `tagger.registry` - field selection

Controls which optional fields are written into `testids.v{N}.json`.

```json
"registry": {
  "profile": "standard",
  "includeHistory": true,
  "semanticFields": ["aria_label", "placeholder"]
}
```

A `profile` sets a baseline; any sibling key overrides it.

| Field | `minimal` | `standard` | `full` |
|---|:-:|:-:|:-:|
| `component`, `tag`, `element_type`, `fingerprint`, `first_seen_version`, `last_seen_version` | ✅ always | ✅ | ✅ |
| `semantic` (object) | `{}` empty | ✅ filtered by `semanticFields` | ✅ all fields |
| `source` | ❌ | ✅ | ✅ |
| `dynamic_children` | ❌ | ✅ | ✅ |
| `last_generated_at`, `generation_history` | ❌ | ❌ | ✅ |

Granular overrides (any of these override the profile default):

| Key | Type | Purpose |
|---|---|---|
| `includeSemantics` | boolean | Write the `semantic` object at all |
| `includeSource` | boolean | Write the `source` field (`generated` / `manual`) |
| `includeHistory` | boolean | Write `last_generated_at` + `generation_history` |
| `includeDynamicChildren` | boolean | Write `dynamic_children` pattern for PrimeNG overlays |
| `semanticFields` | `string[]` | Restrict which sub-keys of `semantic` are kept. Valid values: `formcontrolname`, `name`, `routerlink`, `aria_label`, `placeholder`, `text_content`, `type`, `role` |

`full` (default) matches pre-0.4.0 behaviour byte-for-byte. `standard` drops history fields. `minimal` keeps only required schema fields plus `first_seen_version` / `last_seen_version`.

---

## `differ` section

| Option | Default | What it does |
|---|---|---|
| `outputFormats` | `["md", "json"]` | Which reports to write when `--out-dir` is given. Values: `md`, `json`. |
| `threshold` | `0.8` | Rename-similarity cutoff (0.1–1.0). Lower = more aggressive rename detection. |
| `showRegenerated` | `false` | Split `added` into truly-new vs regenerated entries. |

### CLI overrides

| Flag | Equivalent to |
|---|---|
| `--format md,json` | `outputFormats: ["md", "json"]` |
| `--format json` | `outputFormats: ["json"]` |
| `--threshold 0.9` | `threshold: 0.9` |
| `--show-regenerated` | `showRegenerated: true` |
| `--json-only` | *deprecated* - same as `--format json` |

---

## `locators` section

| Option | Default | What it does |
|---|---|---|
| `variableFormat` | `"{component}_{element}_{key}"` | Template for Python variable names. Same placeholders as `idFormat`, plus `{testid}`. |
| `attributeName` | (inherits `tagger.attributeName`) | Override the attribute used in generated XPaths. |
| `xpathPrefix` | `"xpath:"` | Prepended to every XPath. Set to `""` for SeleniumLibrary auto-detect. |
| `mode` | `"merge"` | Write strategy. `merge` preserves manual lines and rebuilds only `# testid-managed` lines; `overwrite` rewrites from scratch; `refuse` fails if the file exists. |
| `lockNames` | `false` | Persist each emitted variable name onto its registry entry (`locator_name`) and reuse it on later runs. Keeps Python constants stable even when semantics drift (aria-label rewordings, text changes, etc.). |
| `regenerateNames` | `false` | One-shot opt-out: with `lockNames`, recompute every persisted name from the current `variableFormat` and overwrite the registry. Use after changing the template. |
| `overwrite` | *deprecated* | Legacy boolean. Maps to `mode: "overwrite"` (`true`) or `mode: "refuse"` (`false`). Ignored when `mode` is set. |

### `variableFormat`

For hash-only `idFormat`s like `"tid-{hash}"` the testid is opaque (e.g. `tid-abc123ef`). The locator variable name is reconstructed from the registry entry rather than parsed from the testid, so the Python constant stays readable:

```python
orderList_dropdown_customer = "xpath://*[@data-testid='tid-abc123ef']"  # testid-managed
```

Each placeholder value is camelCased individually; literal `_` characters in the template survive as separators.

### `variableFormat` placeholders

Same vocabulary as `idFormat`, sourced from the registry entry:

| Placeholder | Source |
|---|---|
| `{component}` | `entry.component` path, stripped and camelCased |
| `{element}` | `entry.element_type` |
| `{key}` | First non-empty of `semantic.formcontrolname` / `name` / `aria_label` / `placeholder` / `text_content` / `routerlink`, falling back to `tag` |
| `{tag}` | `entry.tag` |
| `{hash}` | First 6 hex chars of `sha256(entry.fingerprint)` |
| `{testid}` | The raw testid itself, camelCased. The tagger preserves the `data-testid` attribute across runs, so a format using `{testid}` produces names that are as stable as the testid in the HTML — immune to aria-label / placeholder rewordings. |

The rendered string is sanitised to a valid Python identifier; leading digits are prefixed with `tid_`.

### CLI overrides

| Flag | Equivalent to |
|---|---|
| `--variable-format '{element}_{key}'` | `variableFormat: "{element}_{key}"` |
| `--attribute-name data-cy` | `attributeName: "data-cy"` |
| `--xpath-prefix ''` | `xpathPrefix: ""` |
| `--mode <merge\|overwrite\|refuse>` | `mode: "<value>"` |
| `--lock-names` | `lockNames: true` |
| `--regenerate-names` | `regenerateNames: true` |
| `--no-overwrite` | *deprecated* - same as `--mode refuse` |

### Locator-name stability

Two independent levers, increasingly robust:

1. **`variableFormat: "{testid}"`** — derive the Python constant from the raw (preserved) testid. Structural template edits (wrapping, reordering) don't touch the testid in the HTML, so the Python name also stays put. Semantic edits (aria-label rewordings) that change the testid still cause the name to change in lockstep.
2. **`lockNames: true`** — on the first run, each emitted name is written back onto its registry entry as `locator_name` and reused verbatim on every subsequent run. The Python constant survives even when the testid itself changes (e.g. after an aria-label rewording), at the cost of a slight registry round-trip. To intentionally pick up a new `variableFormat` for all entries, run once with `--regenerate-names`.

---

## Example configs

Ready-to-copy configs under [`examples/configs/`](../examples/configs/):

| File | Purpose |
|---|---|
| `minimal.json` | Smallest possible registry JSON. |
| `full-featured.json` | All features enabled. |
| `primeng-exclude.json` | Skip decorative PrimeNG wrappers. |
| `custom-tag-map.json` | Map custom Angular components to short-type names. |
| `cypress-style.json` | `data-cy` attribute with a Cypress-friendly idFormat. |
| `hash-only-with-readable-locators.json` | Opaque hash testids with readable Python variables. |
| `legacy-tagger-only.json` | Pre-0.4.0 shape for reference. |

See the [Examples](Examples) page for before/after code snapshots.

## Migrating from `testid-tagger.config.json`

The legacy filename continues to work. To migrate to the unified shape:

1. Rename the file to `testid.config.json`.
2. Wrap the existing keys in `"tagger": { ... }`.
3. Optionally add `differ` / `locators` sections.
