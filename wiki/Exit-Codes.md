# Exit Codes

Every CLI returns a standard set of exit codes, so you can wire them into a CI pipeline without second-guessing.

| Tool | Code | Meaning |
|---|---|---|
| `testid tag` | `0` | All good — even if nothing actually needed tagging. |
|  | `2` | Something was wrong with the config or a template. |
| `testid diff` | `0` | No changes, or only `added` / `regenerated` entries. Safe to merge. |
|  | `1` | At least one `removed`, `renamed`, or `modified` entry — a human should take a look. |
|  | `2` | Couldn't load one of the registry files. |
| `testid gen-locators` | `0` | Locator files written. |
|  | `2` | Registry or I/O error. |

## A pattern that works well in CI

Treat `diff` exit code `1` as "needs human review" rather than a hard failure — block the merge, but let the author sign off explicitly once they've looked at the report. Exit code `2` is the one you always want to fail loudly on: it means the tools couldn't even do their job.
