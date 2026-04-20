# Configuration

Since v0.4.0, all three sub-tools (tagger, differ, locator generator) read from a single **unified config file**. Put it in your project root and pick whichever format is comfortable:

| File | When to use |
|---|---|
| `testid.config.json` | Zero-tooling, first-class (recommended). |
| `testid.config.mjs` / `.js` | Want to compute values with code or import constants. |
| `testid.config.ts` | TypeScript config via a runtime loader (ts-node etc.). |

The old `testid-tagger.config.*` file still works — if it's present and the new one isn't, its root fields are interpreted as the `tagger` section. A one-time deprecation warning is printed to stderr; nothing breaks.

## Shape

```json
{
  "tagger":   { ... },
  "differ":   { ... },
  "locators": { ... }
}
```

All three sections are optional. Empty config = all defaults. You only need to spell out what you actually want to change.

---

## `tagger` section

### Core options

| Option | Default | What it does |
|---|---|---|
| `rootDir` | `"src"` | Where to start looking, relative to the project root. |
| `include` | `["**/*.component.html"]` | Which templates to scan. |
| `ignore` | `[]` | Glob patterns to skip. |
| `registryDir` | `"test-artifacts/testids"` | Where the versioned registry files land. |
| `attributeName` | `"data-testid"` | The attribute itself — swap in `data-cy` for Cypress. |
| `hashAlgorithm` | `"sha256"` | `sha256`, `sha1`, or `md5`. |
| `hashLength` | `6` | Hash-suffix length, 4–16. |
| `collisionStrategy` | `"hash-suffix"` | `hash-suffix` or `error`. |
| `idFormat` | `"{component}__{element}--{key}{hash:-}"` | Naming template (see placeholders below). |
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

### `tagger.registry` — controlling what goes into the JSON

A new sub-section that governs which optional fields are written into `testids.v{N}.json`.

```json
"registry": {
  "profile": "standard",
  "includeHistory": true,
  "semanticFields": ["aria_label", "placeholder"]
}
```

**Profiles** set a baseline; any sibling key overrides it.

| Field | `minimal` | `standard` | `full` |
|---|:-:|:-:|:-:|
| `component`, `tag`, `element_type`, `fingerprint`, `first_seen_version`, `last_seen_version` | ✅ always | ✅ | ✅ |
| `semantic` (object) | `{}` empty | ✅ filtered by `semanticFields` | ✅ all fields |
| `source` | ❌ | ✅ | ✅ |
| `dynamic_children` | ❌ | ✅ | ✅ |
| `last_generated_at`, `generation_history` | ❌ | ❌ | ✅ |

**Granular overrides** (any of these win over the profile):

| Key | Type | Purpose |
|---|---|---|
| `includeSemantics` | boolean | Write the `semantic` object at all |
| `includeSource` | boolean | Write the `source` field (`generated` / `manual`) |
| `includeHistory` | boolean | Write `last_generated_at` + `generation_history` |
| `includeDynamicChildren` | boolean | Write `dynamic_children` pattern for PrimeNG overlays |
| `semanticFields` | `string[]` | Restrict which sub-keys of `semantic` are kept. Valid values: `formcontrolname`, `name`, `routerlink`, `aria_label`, `placeholder`, `text_content`, `type`, `role` |

Pick `standard` if you want a sensible registry that reads nicely in PRs. `minimal` trims the file size in half. `full` (default) matches the pre-0.4.0 behaviour byte-for-byte.

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
| `--json-only` | *deprecated* — same as `--format json` |

---

## `locators` section

| Option | Default | What it does |
|---|---|---|
| `variableFormat` | `"{component}_{element}_{key}"` | Template for Python variable names. Same placeholders as `idFormat`. |
| `attributeName` | (inherits `tagger.attributeName`) | Override the attribute used in generated XPaths. |
| `xpathPrefix` | `"xpath:"` | Prepended to every XPath. Set to `""` for SeleniumLibrary auto-detect. |
| `overwrite` | `true` | Whether to overwrite existing `.py` files. |

### Why `variableFormat` matters

If your `idFormat` is hash-only (`"tid-{hash}"`), the testid is opaque — something like `tid-abc123ef`. Without `variableFormat`, the Python constant would also be `tidAbc123ef`, which tells you nothing. With `{component}_{element}_{key}` the same row becomes:

```python
orderList_dropdown_customer = "xpath://*[@data-testid='tid-abc123ef']"  # testid-managed
```

Each value is camelCased on its own, so literal `_` in the template survives as a separator.

### Placeholders available in `variableFormat`

Same vocabulary as `idFormat`, sourced from the registry entry:

| Placeholder | Source |
|---|---|
| `{component}` | `entry.component` path, stripped and camelCased |
| `{element}` | `entry.element_type` |
| `{key}` | First non-empty of `semantic.formcontrolname` / `name` / `aria_label` / `placeholder` / `text_content` / `routerlink`, falling back to `tag` |
| `{tag}` | `entry.tag` |
| `{hash}` | First 6 hex chars of `sha256(entry.fingerprint)` |

The rendered string is sanitised to a valid Python identifier; leading digits are prefixed with `tid_`.

### CLI overrides

| Flag | Equivalent to |
|---|---|
| `--variable-format '{element}_{key}'` | `variableFormat: "{element}_{key}"` |
| `--attribute-name data-cy` | `attributeName: "data-cy"` |
| `--xpath-prefix ''` | `xpathPrefix: ""` |
| `--no-overwrite` | `overwrite: false` |

---

## Example

See `testid.config.example.json` in the repo root for a copy-paste starting point with every section filled in.

## Migrating from `testid-tagger.config.json`

No action required — the old filename is still picked up and mapped into the `tagger` section. To upgrade at your own pace:

1. Rename the file to `testid.config.json`.
2. Indent all existing keys one level deeper and wrap them in `"tagger": { ... }`.
3. Add `differ` / `locators` sections only when you want to customise them.
