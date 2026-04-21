# Installation

## Requirements

| Tool | Version |
|---|---|
| Node.js | 20 LTS or newer |
| npm | 10 or newer |
| Angular project | 18 or newer |

## Install globally

```bash
npm install
npm run build
npm pack
# produces testid-automation-0.5.0.tgz

npm install -g ./testid-automation-0.5.0.tgz
testid --help
```

## Install into a project

```bash
npm install --save-dev ./testid-automation-0.5.0.tgz
npx testid tag --configuration test
```

Next: [Quick Start](Quick-Start).
