# testid-automation

[![Version](https://img.shields.io/badge/version-0.4.0-blue.svg)](https://github.com/spachtholz/TestID-Generator/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/angular-%E2%89%A5%2018-dd0031.svg)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-%E2%89%A5%205.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-6e9f18.svg)](https://vitest.dev/)

> A build-time toolchain for Angular that keeps your `data-testid` attributes stable, tracks every change in a versioned registry, and — if you want — hands you ready-to-use Robot Framework locators.

## Why bother?

If you've written end-to-end tests for a growing Angular app, you know the pain: it's rarely the test logic that breaks — it's the selectors. CSS classes get renamed, XPath paths crumble the moment someone nests a `<div>`, and hand-picked `data-testid` values drift as soon as two developers disagree on naming.

`testid-automation` fixes this at the source. It reads your templates before the build, figures out a stable, readable name for each element based on what it actually *is*, and writes it back as a `data-testid`. Next time something changes, you get a clean diff you can review — not a mystery broken test suite.

## Install

```bash
npm install
npm run build
npm pack

# Globally
npm install -g ./testid-automation-0.4.0.tgz

# Or just as a dev dependency
npm install --save-dev ./testid-automation-0.4.0.tgz
```

## Quick start

```bash
# Tag your templates
testid tag --verbose

# See what changed between two versions (md + json by default, --format picks)
testid diff testids.v1.json testids.v2.json --out-dir test-artifacts/testids

# Generate Robot Framework locators (variable names built from semantic data)
testid gen-locators testids.latest.json --out-dir tests/locators
```

All three commands read a single `testid.config.json` with `tagger` / `differ` / `locators` sections — see `testid.config.example.json` or the [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration) wiki page for every option.

## Learn more

Everything else — features, configuration options, file formats, integration guides — lives in the [Wiki](https://github.com/spachtholz/TestID-Generator/wiki):

- [Features](https://github.com/spachtholz/TestID-Generator/wiki/Features)
- [Installation](https://github.com/spachtholz/TestID-Generator/wiki/Installation)
- [Quick Start](https://github.com/spachtholz/TestID-Generator/wiki/Quick-Start)
- [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration)
- [Registry Format](https://github.com/spachtholz/TestID-Generator/wiki/Registry-Format)
- [Robot Framework Integration](https://github.com/spachtholz/TestID-Generator/wiki/Robot-Framework-Integration)
- [Exit Codes](https://github.com/spachtholz/TestID-Generator/wiki/Exit-Codes)
- [Development](https://github.com/spachtholz/TestID-Generator/wiki/Development)

## License

Apache 2.0 — see [`LICENSE`](LICENSE). Free to use, just keep the credit.
