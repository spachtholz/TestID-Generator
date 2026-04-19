# Registry Format

Every tagger run writes two files into `registryDir`:

- **`testids.v{N}.json`** — an immutable snapshot, written once and never touched again.
- **`testids.latest.json`** — a byte-identical copy of the newest snapshot, so tools that just want "the current state" always know where to look.

## What an entry looks like

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
  "generation_history": [1]
}
```

## What each field means

| Field | Meaning |
|---|---|
| `component` | Path to the template, relative to the project root. |
| `tag` | The HTML or PrimeNG tag this ID belongs to. |
| `element_type` | A coarse classification — `primeng_table`, `input`, `button`, and so on. |
| `fingerprint` | A deterministic signature built from the tag and its semantics. Stable across runs. |
| `semantic` | Whatever semantic hints the tagger extracted — aria-label, formcontrolname, placeholder, text, type. |
| `source` | `"generated"` if the tagger wrote it, `"manual"` if a human did. |
| `first_seen_version` | The first registry version this entry appeared in. |
| `last_seen_version` | The most recent registry version it showed up in. |
| `last_generated_at` | ISO timestamp of the last time it was (re)generated. |
| `generation_history` | The list of versions in which this entry was created or recreated. |

## Check it into git

The registry belongs in your repo. When someone opens a PR that touches the UI, the testid diff shows up right next to the template diff — no surprises, no "why did my tests break" moments three days later.
