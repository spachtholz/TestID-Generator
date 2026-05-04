# testid-automation

[![Version](https://img.shields.io/badge/version-0.7.0-blue.svg)](https://github.com/spachtholz/TestID-Generator/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-green.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A5%2020-brightgreen.svg)](https://nodejs.org/)
[![Angular](https://img.shields.io/badge/angular-%E2%89%A5%2018-dd0031.svg)](https://angular.dev/)
[![TypeScript](https://img.shields.io/badge/typescript-%E2%89%A5%205.5-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-vitest-6e9f18.svg)](https://vitest.dev/)

Build-time toolchain for Angular. Generates deterministic `data-testid` attributes directly in the templates, tracks them in a versioned registry, and produces Robot-Framework locator files from the registry. Supports native HTML, PrimeNG, and Angular Material out of the box.

## Install

```bash
npm install
npm run build
npm pack

# Globally
npm install -g ./testid-automation-0.5.1.tgz

# Or as a project dev dependency
npm install --save-dev ./testid-automation-0.5.1.tgz
```

## Quick start

```bash
testid tag --verbose
testid diff testids.v1.json testids.v2.json --out-dir test-artifacts/testids
testid gen-locators testids.latest.json --out-dir tests/locators
```

All three commands read a single `testid.config.json` with `tagger` / `differ` / `locators` sections. Ready-to-copy configs for common setups live under [`examples/configs/`](examples/configs/). For the full option reference see the [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration) wiki page.

## Documentation

- [Features](https://github.com/spachtholz/TestID-Generator/wiki/Features)
- [Installation](https://github.com/spachtholz/TestID-Generator/wiki/Installation)
- [Quick Start](https://github.com/spachtholz/TestID-Generator/wiki/Quick-Start)
- [Configuration](https://github.com/spachtholz/TestID-Generator/wiki/Configuration)
- [Registry Format](https://github.com/spachtholz/TestID-Generator/wiki/Registry-Format)
- [Robot Framework Integration](https://github.com/spachtholz/TestID-Generator/wiki/Robot-Framework-Integration)
- [Examples](https://github.com/spachtholz/TestID-Generator/wiki/Examples)
- [Exit Codes](https://github.com/spachtholz/TestID-Generator/wiki/Exit-Codes)
- [Development](https://github.com/spachtholz/TestID-Generator/wiki/Development)

## License

Apache 2.0 - see [`LICENSE`](LICENSE).
