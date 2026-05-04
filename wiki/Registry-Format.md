# Registry Format

Each tagger run writes two files into `registryDir`:

- **`testids.v{N}.json`** - immutable snapshot for registry version N.
- **`testids.latest.json`** - byte-identical copy of the newest snapshot.

## Entry shape

```json
"order-list__table--auftragsliste": {
  "component": "src/app/features/order-list/order-list.component.html",
  "tag": "p-table",
  "element_type": "primeng_table",
  "fingerprint": "p-table|aria-label=Auftragsliste",
  "semantic": {
    "aria_label": "Auftragsliste",
    "formcontrolname": null,
    "placeholder": null,
    "text_content": null,
    "type": null
  },
  "source": "generated",
  "first_seen_version": 1,
  "last_seen_version": 7,
  "last_generated_at": "2026-04-17T10:00:00Z",
  "generation_history": [1],
  "disambiguator": { "kind": "sibling-index", "value": "1" },
  "locator_name": "orderList_primengTable_auftragsliste"
}
```

## Fields

| Field | Always present? | Meaning |
|---|---|---|
| `component` | ✅ | Path to the template, relative to the project root. |
| `tag` | ✅ | Original HTML or PrimeNG tag name. |
| `element_type` | ✅ | Classification (`primeng_table`, `input`, `button`, …). |
| `fingerprint` | ✅ | Deterministic signature built from the tag and its semantics. |
| `semantic` | ✅ (may be `{}`) | Semantic attributes extracted from the element. Sub-keys controlled by `tagger.registry.semanticFields`. |
| `first_seen_version` | ✅ | Registry version in which the entry first appeared. |
| `last_seen_version` | ✅ | Most recent registry version in which the entry was seen. |
| `source` | profile-gated | `"generated"` (tagger) or `"manual"` (human-pinned). |
| `dynamic_children` | profile-gated | Overlay/pop-up selector pattern for PrimeNG dropdowns, calendars, etc. |
| `last_generated_at` | profile-gated | ISO timestamp of the last (re-)generation. |
| `generation_history` | profile-gated | Versions in which the entry was created or recreated. |
| `disambiguator` | only when collision was resolved | `{ kind: 'sibling-index' \| 'hash', value }`. The sibling-index resolver uses this on subsequent runs to keep the slot stable: a fingerprint-matching candidate inherits the same value, new arrivals take the next free number. |
| `locator_name` | only when `locators.lockNames` is on | The resolved Python variable name (including any disambiguator suffix from semantic discrimination or `_N` fallback) emitted by `gen-locators`. Locked once written so it survives semantic drift and the frozen-first disambiguation prevents a newcomer from stealing it. |

Optional fields are controlled by `tagger.registry.profile` (`minimal` / `standard` / `full`) plus per-field overrides. See [Configuration](Configuration) for the profile matrix.

## Version control

The registry is intended to be committed to git. UI changes then show up in PRs alongside the template diff, and the generated diff report can be attached as a PR artifact for review.
