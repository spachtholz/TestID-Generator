/**
 * Single source of truth for the @testid/automation version string.
 *
 * Kept as a standalone module (rather than reading package.json at runtime)
 * so the compiled JavaScript has no fs/url dependencies — the CLI stays
 * snappy and works when the package is published as an immutable tarball.
 *
 * Keep this in sync with `package.json` on every release. A small CI check
 * (`grep -q \"$(cat package.json | jq -r .version)\" src/version.ts`)
 * catches drift in one command.
 */
export const VERSION = '0.3.0';
