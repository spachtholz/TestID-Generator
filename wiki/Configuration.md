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
| `registryDir` | `"test-artifacts/testids"` | Where the versioned registry files are read from and written to. Acts as the default for `registryInputDir` / `registryOutputDir`. |
| `registryInputDir` | (inherits `registryDir`) | Optional. Directory the tagger reads `testids.latest.json` and the full version history from. Useful in hermetic CI when the previous registry is mounted read-only from a shared location. |
| `registryOutputDir` | (inherits `registryDir`) | Optional. Directory the tagger writes new `testids.v{N}.json` snapshots, the `testids.latest.json` pointer, backups and activity logs into. Lets a CI job keep the writable output in the workspace and push it back to a shared location separately. |
| `attributeName` | `"data-testid"` | The attribute itself - swap in `data-cy` for Cypress. |
| `hashAlgorithm` | `"sha256"` | `sha256`, `sha1`, or `md5`. |
| `hashLength` | `6` | Hash-suffix length, 4–16. |
| `collisionStrategy` | `"auto"` | How to disambiguate two elements that produce the same semantic id. See the table below. |
| `idFormat` | `"{component}__{element}--{key}{disambiguator:--}{hash:-}"` | Naming template (see placeholders below). |
| `alwaysHash` | `false` | Force `{hash}` / `{hash:-}` to always render, not just on collisions. Use with hash-only `idFormat`s like `"tid-{hash}"`. |
| `includeUtilityClasses` | `false` | When `true`, Tailwind / utility-shaped class names (`mt-4`, `flex`) can win the readable `{key}` slot. Off by default because semantic class names read better. |
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
| `{disambiguator}` | Sibling-index value like `2` (empty when no collision) |
| `{disambiguator:--}` | Same as `{disambiguator}` but prefixed with `--` when non-empty |

### Collision strategies

When two elements produce the same semantic id, the strategy decides how to make them unique.

| Strategy | What it does | When to use |
|---|---|---|
| `auto` (default) | Tries the readable sibling-index first (`--1`, `--2`). Falls back to `{hash}` when the format has no slot for the index. | Recommended for new projects. |
| `sibling-index` | Assigns `--1`, `--2`, … via the `{disambiguator}` slot. **Registry-aware**: when a previous registry exists, fingerprint-matching candidates inherit their old slot value; only genuinely new members of a colliding group get the next free number. | When you want fully readable testids and stability under insertion / deletion of *non*-byte-identical siblings. |
| `hash-suffix` | Appends the `{hash}` value. The whole colliding group gets a hash suffix. | When you prefer opaque, position-independent ids. |
| `error` | Throws on the first collision. | When you want the build to fail until the template is fixed. |

The sibling-index value is stored as `disambiguator` on the registry entry. On the next run the resolver looks the value up first — fingerprint-matching candidates keep their slot, new members (or anything whose fingerprint changed) get the next free numeric value. For byte-identical groups (same fingerprint, no surrounding context to split them) where a member is *inserted in front* or *deleted from the middle*, the mapping is informationally underdetermined; the run emits a `collision-group-size-changed` warning into `collisions.v{N}.json` so the user can verify their tests against the surviving slots.

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
| `semanticFields` | `string[]` | Restrict which sub-keys of `semantic` are kept. Valid values: `formcontrolname`, `name`, `routerlink`, `aria_label`, `placeholder`, `text_content`, `type`, `role`, `title`, `alt`, `value`, `html_id`, `href`, `src`, `html_for`, `label`, `static_attributes`, `bound_identifiers`, `event_handlers`, `i18n_keys`, `bound_text_paths`, `css_classes`, `child_shape`, `context`, `structural_directives`. |

`full` (default) matches pre-0.4.0 behaviour byte-for-byte. `standard` drops history fields. `minimal` keeps only required schema fields plus `first_seen_version` / `last_seen_version`.

### Tagger CLI overrides

| Flag | Equivalent to |
|---|---|
| `--registry-dir <dir>` | sets both input and output to `<dir>` (legacy single-dir behaviour) |
| `--registry-input-dir <dir>` | `registryInputDir: "<dir>"` — wins over `--registry-dir` |
| `--registry-output-dir <dir>` | `registryOutputDir: "<dir>"` — wins over `--registry-dir` |

#### Hermetic CI example

```bash
# Previous registry sits on a shared, read-only mount; the build writes new
# files into the workspace, then a separate publish step pushes them back.
testid tag \
  --configuration test \
  --registry-input-dir  /mnt/testid-store/$PROJECT/registry \
  --registry-output-dir ./test-artifacts/testids
```

This pattern keeps the build hermetic (no in-place writes against the shared
mount), serialises easily with object-storage locking on the publish step, and
preserves carry-over / regeneration detection because the previous registry
plus full history is read from the shared location.

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
| `lockNames` | `false` | Persist each emitted variable name onto its registry entry (`locator_name`) and reuse it on later runs. Keeps Python constants stable even when semantics drift (aria-label rewordings, text changes, etc.). The **resolved** name is persisted, including any disambiguator suffix — so a frozen `order_btn_save_2` keeps that exact form when the next run sees the same registry. |
| `regenerateNames` | `false` | One-shot opt-out: with `lockNames`, recompute every persisted name from the current `variableFormat` and overwrite the registry. Use after changing the template. |
| `renameThreshold` | `0.8` | Similarity cutoff (0.1..1.0) for rename-aware carry-over of `locator_name`. When the tagger generates a new testid whose fingerprint is highly similar to a removed previous entry holding a `locator_name`, the name is inherited. Raise toward `1.0` for stricter matching. |
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

Four independent levers, increasingly robust:

1. **`variableFormat: "{testid}"`** — derive the Python constant from the raw (preserved) testid. Structural template edits (wrapping, reordering) don't touch the testid in the HTML, so the Python name also stays put. Semantic edits (aria-label rewordings) that change the testid still cause the name to change in lockstep.
2. **Semantic discriminator (always on)** — when two entries with different testids would produce the same bare variable name (`order_btn_save` from text="Save" twice), the generator first tries to find a semantic field that distinguishes them — `event_handlers.click`, `context.fieldset_legend`, `formcontrolname`, etc. — and appends its value as a readable suffix (`order_btn_save_saveAddress` / `order_btn_save_saveBilling`) instead of the noise-suffix `_2`/`_3`. Only when nothing in the snapshot can split the group does the numeric fallback kick in.
3. **`lockNames: true`** — on the first run, each emitted name (including any disambiguator suffix from lever 2) is written back onto its registry entry as `locator_name` and reused verbatim on every subsequent run. **Frozen-first**: when a new colliding entry arrives in a later run, the locked names claim their slots before the newcomer is processed — the new entry gets the suffix, never the old one that downstream tests already reference. To intentionally pick up a new `variableFormat` for all entries, run once with `--regenerate-names`.
4. **`renameThreshold`** (combined with `lockNames`) — makes lever 3 survive in workflows where `data-testid` attributes are not committed to git. The tagger regenerates testids deterministically each build; when a fingerprint-relevant field changes (e.g. an aria-label is reworded), the *new* testid string is unequal to the old key and would normally appear as a brand-new entry. The merge compares every new entry against the removed previous entries via the differ's similarity algorithm and transfers the held `locator_name` when the score clears `renameThreshold`. Net effect: the generated `.py` file updates its XPath value but keeps the Python constant — Robot Framework tests don't break.

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
