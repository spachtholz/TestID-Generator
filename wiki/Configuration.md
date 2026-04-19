# Configuration

The tagger reads `testid-tagger.config.json` from your project root. If you'd rather write your config in JavaScript or TypeScript, it also picks up `.mjs`, `.js`, and `.ts` variants.

## Options

| Option | Default | What it does |
|---|---|---|
| `rootDir` | `"src"` | Where to start looking, relative to the project root. |
| `include` | `["**/*.component.html"]` | Which templates to scan. |
| `ignore` | `[]` | Glob patterns to skip. |
| `registryDir` | `"test-artifacts/testids"` | Where the versioned registry files land. |
| `attributeName` | `"data-testid"` | The attribute itself — swap in `data-cy` for Cypress, for example. |
| `hashAlgorithm` | `"sha256"` | Which hash to use for collision suffixes (`sha256`, `sha1`, `md5`). |
| `hashLength` | `6` | How long the hash suffix is, 4 to 16 characters. |
| `collisionStrategy` | `"hash-suffix"` | `hash-suffix` to append a disambiguator, or `error` to fail the run. |
| `idFormat` | `"{component}__{element}--{key}{hash:-}"` | The naming template. Placeholders: `{component} {element} {key} {tag} {hash} {hash:-}`. |
| `testConfigurationOnly` | `true` | When `true`, the tagger only fires on `--configuration=test`. |
| `registryRetention` | `0` | Set to `> 0` to keep only the N most recent `testids.vN.json` files. |
| `writeActivityLog` | `false` | If on, writes a per-run `activity.v{N}.md` + `.json`. |
| `ignoreTags` | `[]` | Extra tag names to skip on top of the built-in deny list. |

## A few notes

- The ID format template is where most of the style lives. Short team? `{element}--{key}` reads nicely. Big monorepo? Keep the `{component}` prefix.
- `registryRetention` is handy once you've got a few hundred versions — the older snapshots are preserved in git history anyway.
- If `testConfigurationOnly` gets in your way during local experimentation, set it to `false` in a local config file and keep the committed version strict.
