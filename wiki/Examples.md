# Examples

Concrete before/after snapshots for every stage of the tool. If the configuration reference feels abstract, read this page first — it shows exactly what each command does to your files.

## Table of contents

- [1. Tagging a template](#1-tagging-a-template)
- [2. The generated registry JSON](#2-the-generated-registry-json)
- [3. Diffing between versions](#3-diffing-between-versions)
- [4. Rolling back a tagger run](#4-rolling-back-a-tagger-run)
- [5. Robot Framework locator file](#5-robot-framework-locator-file)
- [6. customTagMap in action](#6-customtagmap-in-action)
- [7. Hash-only testids with readable locator names](#7-hash-only-testids-with-readable-locator-names)

---

## 1. Tagging a template

### Before

```html
<!-- src/app/login/login.component.html -->
<form [formGroup]="form" (ngSubmit)="submit()">
  <h2>Sign in</h2>

  <label for="email">Email</label>
  <input id="email" type="email" formControlName="email" placeholder="you@example.com">

  <label for="password">Password</label>
  <input id="password" type="password" formControlName="password">

  <p-checkbox formControlName="remember" label="Remember me"></p-checkbox>

  <button type="submit">Sign in</button>
  <a routerLink="/forgot">Forgot password?</a>
</form>
```

### After `testid tag`

```html
<!-- src/app/login/login.component.html -->
<form [formGroup]="form" (ngSubmit)="submit()" data-testid="login__form--email">
  <h2 data-testid="login__h2--sign-in">Sign in</h2>

  <label for="email" data-testid="login__label--email">Email</label>
  <input id="email" type="email" formControlName="email" placeholder="you@example.com"
         data-testid="login__input--email">

  <label for="password" data-testid="login__label--password">Password</label>
  <input id="password" type="password" formControlName="password"
         data-testid="login__input--password">

  <p-checkbox formControlName="remember" label="Remember me"
              data-testid="login__checkbox--remember"></p-checkbox>

  <button type="submit" data-testid="login__button--sign-in">Sign in</button>
  <a routerLink="/forgot" data-testid="login__link--forgot">Forgot password?</a>
</form>
```

What changed:
- Every interactive element picked up a `data-testid`.
- The slot is built from `{component}__{element}--{key}` — the `{key}` is taken from the most-specific semantic attribute the tagger found (`formControlName`, `aria-label`, `routerLink`, visible text, …).
- The surrounding `<form>` also got tagged because its `formControlName`-laden descendant bubbles up a stable key. Wrapping layouts that carry no semantics at all would be skipped.

---

## 2. The generated registry JSON

```json
// test-artifacts/testids/testids.v1.json  (excerpt, standard profile)
{
  "$schema": "./testid-registry.schema.json",
  "version": 1,
  "generated_at": "2026-04-20T07:31:00Z",
  "entries": {
    "login__input--email": {
      "component": "src/app/login/login.component.html",
      "tag": "input",
      "element_type": "native_input_email",
      "fingerprint": "input|type=email|formcontrolname=email|placeholder=you@example.com",
      "semantic": {
        "formcontrolname": "email",
        "placeholder": "you@example.com",
        "aria_label": null,
        "text_content": null
      },
      "source": "generated",
      "dynamic_children": null,
      "first_seen_version": 1,
      "last_seen_version": 1
    },
    "login__button--sign-in": {
      "component": "src/app/login/login.component.html",
      "tag": "button",
      "element_type": "native_button_submit",
      "fingerprint": "button|type=submit|text=Sign in",
      "semantic": {
        "formcontrolname": null,
        "text_content": "Sign in",
        "aria_label": null,
        "placeholder": null
      },
      "source": "generated",
      "dynamic_children": null,
      "first_seen_version": 1,
      "last_seen_version": 1
    }
  }
}
```

The exact fields you see depend on `tagger.registry.profile`:

- **`minimal`** — drops `source`, `dynamic_children`, `semantic.*`. Just id + fingerprint + versions.
- **`standard`** (above) — keeps the most-useful four semantic sub-fields.
- **`full`** — every optional field, plus `last_generated_at` and `generation_history`.

---

## 3. Diffing between versions

After a UI change, re-run the tagger and diff the two snapshots:

```bash
testid tag
testid diff test-artifacts/testids/testids.v1.json \
            test-artifacts/testids/testids.v2.json \
            --out-dir test-artifacts/testids
```

### `diff.v1-v2.md`

```markdown
# Testid Registry Diff: v1 → v2

_Generated at 2026-04-20T07:45:00Z_

## Summary

| Category | Count |
| --- | ---: |
| unchanged | 7 |
| added | 1 |
| removed | 0 |
| renamed | 1 |
| modified | 1 |

## Renamed

| Old ID | New ID | Confidence | Component |
| --- | --- | ---: | --- |
| `login__button--sign-in` | `login__button--login` | 0.92 | src/app/login/login.component.html |

## Modified

| ID | Component | Old Fingerprint | New Fingerprint |
| --- | --- | --- | --- |
| `login__input--password` | src/app/login/login.component.html | `input\|type=password\|formcontrolname=password` | `input\|type=password\|formcontrolname=password\|aria-label=Password` |

## Added

| ID | Component |
| --- | --- |
| `login__link--register` | src/app/login/login.component.html |

## Affected Components

- src/app/login/login.component.html
```

### `diff.v1-v2.json`

```json
{
  "from_version": 1,
  "to_version": 2,
  "generated_at": "2026-04-20T07:45:00Z",
  "summary": { "unchanged": 7, "added": 1, "removed": 0, "renamed": 1, "modified": 1, "regenerated": 0 },
  "renamed": [
    {
      "old_id": "login__button--sign-in",
      "new_id": "login__button--login",
      "confidence": 0.92,
      "component": "src/app/login/login.component.html"
    }
  ],
  "modified": [
    {
      "id": "login__input--password",
      "component": "src/app/login/login.component.html",
      "old_fingerprint": "input|type=password|formcontrolname=password",
      "new_fingerprint": "input|type=password|formcontrolname=password|aria-label=Password"
    }
  ],
  "added": [
    { "id": "login__link--register", "component": "src/app/login/login.component.html" }
  ]
}
```

Want just one of these? `--format md` or `--format json` — see [Configuration](Configuration#differ-section).

---

## 4. Rolling back a tagger run

Every tagger run backs up the templates it's about to rewrite. If a run produced unwanted IDs, you don't have to fix them by hand — one command undoes the whole thing.

### Starting point (v3 is the latest)

```text
test-artifacts/testids/
├── testids.v1.json
├── testids.v2.json
├── testids.v3.json        ← latest
├── testids.latest.json    ← copy of v3
└── backup.v3/
    ├── manifest.json
    └── src/app/login/login.component.html   ← pre-run copy
```

### Run the rollback

```bash
testid rollback
```

### Result

```text
test-artifacts/testids/
├── testids.v1.json
├── testids.v2.json        ← now also the latest
└── testids.latest.json    ← rewritten to be a copy of v2
```

Plus: `src/app/login/login.component.html` is bit-for-bit restored to what it was before the v3 tagger run, and the `backup.v3/` folder is gone.

### Template, step by step

```html
<!-- Before v3 tagger run -->
<button type="submit" data-testid="login__button--sign-in">Sign in</button>

<!-- After v3 tagger run (the run we regretted) -->
<button type="submit" data-testid="login__button--login">Sign in</button>

<!-- After `testid rollback` -->
<button type="submit" data-testid="login__button--sign-in">Sign in</button>
```

Rollback is gated by `tagger.writeBackups: true` (default). If you had backups off, the rollback command reports nothing to do and exits cleanly.

---

## 5. Robot Framework locator file

```bash
testid gen-locators test-artifacts/testids/testids.latest.json --out-dir tests/locators
```

### `tests/locators/login.py`

```python
# Generated by testid-gen-locators — do not edit.
# Component: login
# Re-run testid-gen-locators after every tagger run that changes the registry.

login_button_signIn       = "xpath://*[@data-testid='login__button--sign-in']"  # testid-managed
login_checkbox_remember   = "xpath://*[@data-testid='login__checkbox--remember']"  # testid-managed
login_form_email          = "xpath://*[@data-testid='login__form--email']"  # testid-managed
login_h2_signIn           = "xpath://*[@data-testid='login__h2--sign-in']"  # testid-managed
login_input_email         = "xpath://*[@data-testid='login__input--email']"  # testid-managed
login_input_password      = "xpath://*[@data-testid='login__input--password']"  # testid-managed
login_label_email         = "xpath://*[@data-testid='login__label--email']"  # testid-managed
login_label_password      = "xpath://*[@data-testid='login__label--password']"  # testid-managed
login_link_forgot         = "xpath://*[@data-testid='login__link--forgot']"  # testid-managed
```

Use them from a Robot Framework suite:

```robot
*** Settings ***
Library    SeleniumLibrary
Variables  ../locators/login.py

*** Test Cases ***
Can sign in with valid credentials
    Input Text         ${login_input_email}     testuser@example.com
    Input Password     ${login_input_password}  correcthorsebatterystaple
    Click Button       ${login_button_signIn}
    Wait Until Page Contains Element    ${dashboard_h1_welcome}
```

---

## 6. customTagMap in action

With the default mapping, Angular custom components fall back to a generic slug:

```html
<!-- default behaviour -->
<app-user-menu data-testid="header__app-user-menu--main"></app-user-menu>
```

That `app-user-menu` slot is noisy. Add a `customTagMap` entry:

```json
{
  "tagger": {
    "customTagMap": {
      "app-user-menu": { "shortType": "menu", "longType": "custom_user_menu" }
    }
  }
}
```

and re-run the tagger:

```html
<!-- with customTagMap -->
<app-user-menu data-testid="header__menu--main"></app-user-menu>
```

The registry now groups the entry as `element_type: "custom_user_menu"` — so tests and reports can filter on a meaningful category instead of a tag slug.

See [`examples/configs/custom-tag-map.json`](../examples/configs/custom-tag-map.json) for a full sample with several components mapped.

---

## 7. Hash-only testids with readable locator names

Sometimes you want short opaque testids in the DOM (fewer bytes, no leaked semantics) but still readable test code. Set both sides of the config:

```json
{
  "tagger": {
    "idFormat": "tid-{hash}",
    "hashLength": 8,
    "alwaysHash": true,
    "collisionStrategy": "error"
  },
  "locators": {
    "variableFormat": "{component}_{element}_{key}"
  }
}
```

**Why `alwaysHash: true`?** By default, the hash is only emitted when the tagger needs to disambiguate a collision. With `alwaysHash: true`, it's always computed — a requirement for hash-only formats where the hash *is* the id.

**Why `collisionStrategy: "error"`?** Short hashes can — very rarely — collide. In a hash-only setup you want to know immediately and add a distinguishing semantic, not silently get longer ids.

### HTML stays opaque

```html
<input formControlName="email" data-testid="tid-a1b2c3d4">
<button type="submit" data-testid="tid-e5f6a7b8">Sign in</button>
```

### Python locator file stays readable

```python
login_input_email    = "xpath://*[@data-testid='tid-a1b2c3d4']"  # testid-managed
login_button_signIn  = "xpath://*[@data-testid='tid-e5f6a7b8']"  # testid-managed
```

The variable name is rebuilt from the registry entry's `component`, `element_type`, and semantic key — the testid itself is never parsed. So your tests read naturally even when the DOM attribute is pure hash.

Full example: [`examples/configs/hash-only-with-readable-locators.json`](../examples/configs/hash-only-with-readable-locators.json).
