# Features

## Deterministic tagging

IDs are derived from the element's semantic attributes. The tagger checks, in order: `formControlName`, `name`, `routerLink`, `aria-label`, `placeholder`, visible text, `type`, `role`. It falls back to the tag name only when none of these are present. Given the same input, every run produces identical IDs.

## PrimeNG and Angular Material support

Native HTML, PrimeNG and Angular Material components are classified into short element types (`dropdown`, `calendar`, `table`, etc.). Overlay-based PrimeNG components (`p-dropdown`, `p-datepicker`, `p-multiselect`, …) additionally receive a `dynamic_children` selector pattern for addressing their rendered children.

## Versioned registry

Each run writes `testids.v{N}.json` and updates `testids.latest.json` (byte-identical copy of the newest version). Every entry tracks `first_seen_version`, `last_seen_version`, and optionally `last_generated_at` plus `generation_history` for regeneration events.

## Source and timestamp tracking

Each entry records a `source` (`generated` or `manual`) and a `last_generated_at` timestamp. When a testid transitions from `generated` to `manual` (a developer pinned the value by hand), the tagger emits a one-time stderr warning in the version where the transition occurred.

## Diff reports

`testid diff` categorises changes into `unchanged`, `added`, `removed`, `renamed`, `modified`, and `regenerated`. Output formats: Markdown, JSON, or both, configurable per run.

## Robot Framework locator generator

`testid gen-locators` emits one Python module per component, containing XPath constants tagged with a `# testid-managed` marker. Variable names are derived from a configurable template (`{component}_{element}_{key}` by default), so names stay readable even when the testids are hash-only.

## Configurable ID format

The `idFormat` template accepts the placeholders `{component}`, `{element}`, `{key}`, `{tag}`, `{hash}`, `{hash:-}`, `{disambiguator}`, and `{disambiguator:--}`. The target attribute name (`data-testid`, `data-cy`, …) and hash algorithm (`sha256`, `sha1`, `md5`) are also configurable. The `:--` and `:-` variants render the value with a `--` or `-` prefix when set, and as an empty string otherwise — handy for slots that should disappear when no collision needs disambiguating.

## Collision strategies

Two elements that share the same semantic fingerprint would otherwise produce the same testid. The `collisionStrategy` setting decides how to make them unique:

- `auto` (default) — assigns readable suffixes like `--1`, `--2`, `--3`. Registry-aware: on re-runs, fingerprint-matching candidates inherit their old slot value from the previous registry; only newly-arrived members of a colliding group get the next free number. Falls back to a hash suffix if the format has no slot for the index.
- `sibling-index` — always uses the readable `--N` suffix, with the same registry-aware slot reuse as `auto`.
- `hash-suffix` — appends the fingerprint hash to every member of the colliding group.
- `error` — fails the run on the first collision so a human has to add a distinguishing attribute.

When the size of a colliding group changes between runs (a member was added or removed), the run emits a `collision-group-size-changed` warning into `collisions.v{N}.json`. For byte-identical groups (same fingerprint, same surrounding context) the surviving slot mapping is informationally underdetermined — the warning surfaces it so tests can be verified rather than silently shifting target.

## Wrapper-aware fingerprinting

`child_shape` records the tag sequence of an element's direct children, with each child annotated by its shallow primary identifier (`["h3:adresse", "p:hauptstr-12"]` instead of just `["h3", "p"]`). Two structurally-identical wrapper divs around different content stop colliding because their child rows carry different keys. Extraction is shallow by design — only the child's own attributes / static text are inspected, not grandchildren — which keeps the cost bounded and avoids cascading drift when something deeper in the subtree changes.

## Stable locator names

When two registry entries with different testids would produce the same bare Python variable name (`order_btn_save` from `text="Save"` on two buttons with different click handlers), the locator generator looks at the semantic snapshot to find a field that distinguishes them — `event_handlers.click`, `context.fieldset_legend`, `formcontrolname`, etc. — and appends its value as a readable suffix (`order_btn_save_saveAddress` / `order_btn_save_saveBilling`) instead of the noise-suffix `_2`/`_3`. Only truly identical entries (only the underlying hash differs) fall through to the numeric suffix.

With `lockNames: true`, the **resolved** variable name (including any disambiguator suffix) is persisted on the registry entry as `locator_name`. Frozen names then claim their slots first on every subsequent run, so a newly-arrived collision-eligible entry can never steal a name that downstream Robot Framework tests already reference.

## Rollback

Before overwriting templates, the tagger writes the original file into `backup.v{N}/` along with a manifest. `testid rollback` restores the previous state: templates are copied back, the latest registry version is dropped, and `testids.latest.json` is rewound. Gated by `writeBackups: true` (default).

## Selective runs

The `--files` flag restricts a tagger run to specific templates or glob patterns, overriding `config.include` for that invocation.

## Custom tag mapping

`customTagMap` maps custom tag names to explicit `shortType` / `longType` values. Useful for your own Angular components (`<app-user-menu>` → `menu`) and as an override for built-in classifications.

## CI integration

Deterministic output, canonical JSON serialisation, documented exit codes, no network calls at runtime. Compatible with any standard CI pipeline.
