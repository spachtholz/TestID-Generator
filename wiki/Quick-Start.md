# Quick Start

Five minutes from zero to your first tagged templates.

## 1. Drop in a config

Create `testid.config.json` in the root of your Angular project:

```json
{
  "tagger": {
    "rootDir": "src",
    "include": ["**/*.component.html"],
    "registryDir": "test-artifacts/testids",
    "testConfigurationOnly": false
  }
}
```

That's a minimal setup — we'll cover the rest in [Configuration](Configuration).

> **Legacy note:** Projects on v0.3.x used `testid-tagger.config.json` with root-level fields. That file still works — the tagger maps it into the new `tagger` section automatically. No migration is required to upgrade.

## 2. Tag your templates

```bash
testid tag --verbose
```

The tagger walks through your templates, adds `data-testid` attributes where they make sense, and writes the first registry snapshot to `testids.v1.json`.

## 3. Diff after UI changes

Made some changes? Run the tagger again, then compare:

```bash
testid tag
testid diff test-artifacts/testids/testids.v1.json \
            test-artifacts/testids/testids.v2.json \
            --out-dir test-artifacts/testids
```

You'll get a Markdown report listing what's new, gone, renamed, or modified — perfect for a PR review.

## 4. Generate Robot Framework locators

```bash
testid gen-locators test-artifacts/testids/testids.latest.json \
                    --out-dir tests/locators
```

One Python file per component, ready to import into your test suite.

## Subcommands at a glance

```
testid <command> [options]

  tag             Add data-testid attributes to Angular templates
  diff            Compare two registry JSON files and write a report
  gen-locators    Generate Robot Framework Python modules
```

Each one has its own flags — run `testid <command> --help` for the full list.
