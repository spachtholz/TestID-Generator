# Quick Start

## 1. Create a config

Create `testid.config.json` in your project root:

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

See [Configuration](Configuration) for all options.

Projects on v0.3.x that use `testid-tagger.config.json` with root-level fields continue to work - the loader wraps the legacy file into the new `tagger` section automatically.

## 2. Tag your templates

```bash
testid tag --verbose
```

Adds `data-testid` attributes where applicable and writes `testids.v1.json`.

## 3. Diff between versions

```bash
testid tag
testid diff test-artifacts/testids/testids.v1.json \
            test-artifacts/testids/testids.v2.json \
            --out-dir test-artifacts/testids
```

Produces a Markdown and JSON report listing `added`, `removed`, `renamed`, and `modified` entries.

## 4. Generate Robot Framework locators

```bash
testid gen-locators test-artifacts/testids/testids.latest.json \
                    --out-dir tests/locators
```

Writes one Python module per component.

## Subcommands

```
testid <command> [options]

  tag             Add data-testid attributes to Angular templates
  diff            Compare two registry JSON files
  gen-locators    Generate Robot Framework Python modules
  rollback        Undo the last tag run
```

Run `testid <command> --help` for command-specific flags.
