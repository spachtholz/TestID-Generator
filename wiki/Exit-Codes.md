# Exit Codes

| Tool | Code | Meaning |
|---|---|---|
| `testid tag` | `0` | Success (including no-op runs). |
|  | `2` | Configuration or template error. |
| `testid diff` | `0` | No changes, or only `added` / `regenerated` entries. |
|  | `1` | At least one `removed`, `renamed`, or `modified` entry. |
|  | `2` | Failed to load one of the registry files. |
| `testid gen-locators` | `0` | Locator files written. |
|  | `2` | Registry load or I/O error. |
| `testid rollback` | `0` | Rollback completed (or no backup found). |
|  | `2` | Failed to read the backup manifest or restore a file. |

## CI usage

Treat exit code `1` from `testid diff` as a review gate rather than a hard failure - block the merge but allow explicit sign-off once the diff has been reviewed. Exit code `2` always indicates an execution failure and should fail the pipeline.
