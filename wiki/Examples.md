# Examples

Before/after snapshots for each stage of the tool.

## Table of contents

- [1. Tagging a template](#1-tagging-a-template)
- [2. The generated registry JSON](#2-the-generated-registry-json)
- [3. Diffing between versions](#3-diffing-between-versions)
- [4. Rolling back a tagger run](#4-rolling-back-a-tagger-run)
- [5. Robot Framework locator file](#5-robot-framework-locator-file)
- [6. customTagMap in action](#6-customtagmap-in-action)
- [7. Hash-only testids with readable locator names](#7-hash-only-testids-with-readable-locator-names)
- [8. Mixing manual and generated locators](#8-mixing-manual-and-generated-locators)
- [9. Resolving collisions with sibling-index suffixes](#9-resolving-collisions-with-sibling-index-suffixes)

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

Notes:
- Every interactive element receives a `data-testid`.
- The slot is built from `{component}__{element}--{key}`. The `{key}` is the most-specific semantic attribute found (`formControlName`, `aria-label`, `routerLink`, visible text, …).
- The `<form>` element is tagged because a descendant provides a stable key. Layout wrappers without semantics are skipped.

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

The fields present depend on `tagger.registry.profile`:

- `minimal` - drops `source`, `dynamic_children`, and `semantic.*`. Keeps id, fingerprint, and version fields.
- `standard` (shown above) - keeps four semantic sub-fields.
- `full` - every optional field including `last_generated_at` and `generation_history`.

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

To restrict output to one format, pass `--format md` or `--format json`. See [Configuration](Configuration#differ-section) for defaults and config file options.

---

## 4. Rolling back a tagger run

Every tagger run writes pre-run backups of the templates it rewrites. `testid rollback` restores the prior state.

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

In addition, `src/app/login/login.component.html` is restored bit-for-bit to its pre-v3 state and the `backup.v3/` folder is removed.

### Template, step by step

```html
<!-- Before v3 tagger run -->
<button type="submit" data-testid="login__button--sign-in">Sign in</button>

<!-- After v3 tagger run (the run we regretted) -->
<button type="submit" data-testid="login__button--login">Sign in</button>

<!-- After `testid rollback` -->
<button type="submit" data-testid="login__button--sign-in">Sign in</button>
```

Rollback requires `tagger.writeBackups: true` (default). With backups disabled, `testid rollback` reports no action and exits cleanly.

---

## 5. Robot Framework locator file

```bash
testid gen-locators test-artifacts/testids/testids.latest.json --out-dir tests/locators
```

### `tests/locators/login.py`

```python
# Generated by testid-gen-locators - do not edit.
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

## 6. customTagMap

Without mapping, custom components use their tag name as the element slug:

```html
<!-- default behaviour -->
<app-user-menu data-testid="header__app-user-menu--main"></app-user-menu>
```

Add a `customTagMap` entry to shorten the slot:

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

The entry's `element_type` is now `custom_user_menu`, allowing tests and reports to filter by semantic category instead of the tag slug.

See [`examples/configs/custom-tag-map.json`](../examples/configs/custom-tag-map.json) for a complete sample.

---

## 7. Hash-only testids with readable locator names

For short opaque testids in the DOM combined with readable test code, configure both sides:

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

`alwaysHash: true` forces the hash to be computed on every run, which is required for hash-only formats where the hash is the id itself.

`collisionStrategy: "error"` causes the run to fail on hash collisions rather than silently lengthening ids. Recommended for hash-only setups so collisions surface early.

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

The variable name is reconstructed from the registry entry's `component`, `element_type`, and semantic key - the testid is not parsed. The Python constants remain meaningful even though the DOM attribute is opaque.

Full example: [`examples/configs/hash-only-with-readable-locators.json`](../examples/configs/hash-only-with-readable-locators.json).

---

## 8. Mixing manual and generated locators

Since v0.5.0, `testid gen-locators` preserves manual locator entries by default (`mode: "merge"`). Add imports, helper constants, or locators for dynamic IDs directly into the generated file - they stay in place across runs.

### Before regeneration

```python
# tests/locators/login.py
# Generated by testid-gen-locators - do not edit.
# Component: login

login_input_email   = "xpath://*[@data-testid='login__input--email']"  # testid-managed
login_input_password = "xpath://*[@data-testid='login__input--password']"  # testid-managed

# Helper for the debug panel that only appears in QA builds
login_debug_panel = "xpath://div[@data-qa-debug='true']"

login_button_signIn = "xpath://*[@data-testid='login__button--sign-in']"  # testid-managed
```

### After `testid gen-locators`

Assuming the registry still contains all three testids and nothing has changed:

```python
# tests/locators/login.py
# Generated by testid-gen-locators - do not edit.
# Component: login

login_input_email   = "xpath://*[@data-testid='login__input--email']"  # testid-managed
login_input_password = "xpath://*[@data-testid='login__input--password']"  # testid-managed

login_debug_panel = "xpath://div[@data-qa-debug='true']"

login_button_signIn = "xpath://*[@data-testid='login__button--sign-in']"  # testid-managed
```

Identical output - the helper is preserved and sits between the two managed blocks it was originally placed in. On a registry change, only the `# testid-managed` lines are affected; `login_debug_panel` never moves.

### Forcing a full rewrite

If you want to discard manual content and start fresh:

```bash
testid gen-locators testids.latest.json --out-dir tests/locators --mode overwrite
```

---

## 9. Resolving collisions with sibling-index suffixes

When two elements in the same template produce the same semantic id, the default `auto` strategy assigns readable suffixes in source order. This template:

```html
<div>
  <button>Save</button>
  <button>Save</button>
  <button>Save</button>
</div>
```

becomes:

```html
<div data-testid="order__div--button-button-button">
  <button data-testid="order__button--save--1">Save</button>
  <button data-testid="order__button--save--2">Save</button>
  <button data-testid="order__button--save--3">Save</button>
</div>
```

The numbering follows the order the elements appear in the source file. As long as the source is unchanged, re-runs always produce the same ids. The chosen suffix is also stored on the registry entry, which keeps Robot Framework variable names stable when locked with `lockNames: true`.

If you prefer the legacy hex-hash form, set `collisionStrategy: "hash-suffix"`. If you want the build to fail instead, set `"error"`.
