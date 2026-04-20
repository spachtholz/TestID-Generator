# Installation

## What you need

| Tool | Version |
|---|---|
| Node.js | 20 LTS or newer |
| npm | 10 or newer |
| Angular project | 18 or newer (for `@if` / `@for` block syntax) |

The package builds locally and installs as a tarball, so there's no pnpm workspace dance on the target project. On Windows, the same commands work in PowerShell, CMD, Git Bash, and WSL — pick whichever you like.

## Install globally

If you want the `testid` command available anywhere:

```bash
# 1. Build it from your checkout
npm install
npm run build
npm pack
# → produces testid-automation-0.4.0.tgz

# 2. Install globally
npm install -g ./testid-automation-0.4.0.tgz

# 3. Sanity check
testid --help
```

## Install into an Angular project

If you'd rather scope it to a single project:

```bash
npm install --save-dev ./testid-automation-0.4.0.tgz
npx testid tag --configuration test
```

That's it — you're ready for the [Quick Start](Quick-Start).
