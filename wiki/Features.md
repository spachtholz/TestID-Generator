# Features

## Deterministic tagging

Testids aren't made up on the fly — they're derived from what the element actually is. The tagger looks at `aria-label` first, then `placeholder`, then visible text, and falls back to the element's position in the tag only when nothing else is there. Same UI in, same IDs out. Every single build.

## PrimeNG out of the box

Overlays, calendars, dropdowns, and tables get an extra `dynamic_children` descriptor, so your tests can reach into those pop-up DOM fragments without having to guess CSS classes every time PrimeNG ships a new minor version.

## A versioned registry

Every run archives the complete ID set as `testids.v{N}.json`, and keeps `testids.latest.json` pointing at the newest one. Each entry remembers when it first appeared, when it was last seen, and whether it's been regenerated after a prior removal.

## An audit trail you'll actually want

Every entry carries a `source` (`"generated"` or `"manual"`) and a `last_generated_at` timestamp, so you can tell at a glance which IDs the tagger owns, which ones someone wrote by hand, and when something that was deleted quietly came back.

## Diffs that make sense in a PR

`testid-differ` groups changes into `unchanged`, `added`, `removed`, `renamed`, `modified`, and — optionally — `regenerated`. You get Markdown for human review and JSON for anything you want to automate on top.

## One-time override warnings

If a developer overrides an auto-generated ID with a manual one, you get a single `[testid-tagger] override: …` notice on stderr during the next run — just enough to catch it in review, not so much that it becomes noise.

## Robot Framework locators, for free

`testid-gen-locators` writes one Python file per component, full of camelCase constants and XPath selectors that plug straight into a Selenium Library suite.

## Naming, your way

The `idFormat` template lets you shape the generated names however you want: use `{component}`, `{element}`, `{key}`, `{hash:-}`, mix in static text, swap `data-testid` for `data-cy`. Whatever your house style is, the tagger can match it.

## Safe to experiment

Before every run, the templates touched by the tagger get copied into `backup.v{N}/`. If you don't like what happened, `testid rollback` puts everything back and rewinds the registry by one version.

## Tag just the parts you care about

`testid tag --files src/app/features/order-list/...` limits a run to a handful of files or a glob — no need to touch the config just to test something out.

## Teach it about your own components

`customTagMap` lets you tell the tagger that `<app-user-menu>` should show up as `menu` in the testid, not as the full component name. Small touch, much cleaner IDs.

## CI-friendly by default

Deterministic output, canonical JSON serialization, documented exit codes, and no surprise network calls. Drop it into any pipeline without second-guessing it.
